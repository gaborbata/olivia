var fs = require('fs');
var process = require('process');
var CryptoJS = require('./asset/js/crypto/crypto-js.js');
var ARC = require('./asset/js/arc/arc.js');
var pako = require('./asset/js/zlib/pako.js');
var zlibEnabled = true;

//console.log(ARC.version);

var App = App || (function () {
  var cryptoConfig = {
    keySize: 256,
    ivSize: 128,
    saltSize: 128,
    iterations: 100,
    hasher: CryptoJS.algo.SHA256,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
  };

  function generateKey(password, salt) {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: cryptoConfig.keySize / 32,
      iterations: cryptoConfig.iterations,
      hasher: cryptoConfig.hasher
    });
  }

  function encrypt(message, password, name, date) {
    var salt = CryptoJS.lib.WordArray.random(cryptoConfig.saltSize / 8);
    var iv = CryptoJS.lib.WordArray.random(cryptoConfig.ivSize / 8);
    var encrypted = CryptoJS.AES.encrypt(message, generateKey(password, salt), {
      iv: iv,
      padding: cryptoConfig.padding,
      mode: cryptoConfig.mode
    });
    var encryptedFileBytes = App.wordArrayToByteArray(salt.concat(iv).concat(encrypted.ciphertext));
    var arcHeaderBytes = ARC.createArcHeader(encryptedFileBytes, name, date);
    if (arcHeaderBytes.length != ARC.headerSize) {
      throw new Error('Invalid ARC header length: ' + arcHeaderBytes.length);
    }
    console.log('Enc:', name.toUpperCase().padEnd(14, ' '), date.toISOString(), (Math.ceil((ARC.headerSize + encryptedFileBytes.length) / 1024.0) + ' kB').padStart(10, ' '));
    return new Uint8Array(Array.from(arcHeaderBytes).concat(Array.from(encryptedFileBytes)).concat(ARC.endOfFile));
  }

  function decrypt(encrypted, password) {
    var arc = ARC.parseArcFile(encrypted);
    console.log('Dec:', arc.header.filename.padEnd(14, ' '), arc.header.timestamp, (arc.checksum && arc.sizeMatches) ? ' OK' : ' ERROR');
    if (!arc.checksum || !arc.sizeMatches) {
      throw new Error('Corrupted file:', arc.header.filename);
    }

    var message = App.byteArrayToWordArray(encrypted, ARC.headerSize, ARC.endOfFile.length);
    if (message.sigBytes != arc.header.original) {
      throw new Error('Invalid message size: ' + message.sigBytes + ' (header: ' + arc.header.original + ')');
    }
    var words = message.words;

    var salt = CryptoJS.lib.WordArray.create(words.slice(0, cryptoConfig.saltSize / 32));
    words.splice(0, cryptoConfig.saltSize / 32);
    message.sigBytes -= (cryptoConfig.saltSize / 8);

    var iv = CryptoJS.lib.WordArray.create(words.slice(0, cryptoConfig.ivSize / 32));
    words.splice(0, cryptoConfig.ivSize / 32);
    message.sigBytes -= (cryptoConfig.ivSize / 8);

    var params = CryptoJS.lib.CipherParams.create({ ciphertext: message });

    var decrypted = CryptoJS.AES.decrypt(params, generateKey(password, salt), {
      iv: iv,
      padding: cryptoConfig.padding,
      mode: cryptoConfig.mode
    });

    return decrypted;
  }

  function wordArrayToByteArray(wordArray) {
    var words = wordArray.words;
    var sigBytes = wordArray.sigBytes;
    var bytes = new Uint8Array(sigBytes);
    for (var i = 0; i < sigBytes; i++) {
      bytes[i] = (words[(i >>> 2)] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return bytes;
  }

  function byteArrayToWordArray(bytes, offset, eofSize) {
    var offset = offset || 0;
    var eofSize = eofSize || 0;
    var bytesLength = bytes.length - offset - eofSize;
    var words = [];
    for (var i = 0; i < bytesLength; i++) {
      words[(i >>> 2)] |= (bytes[i + offset] & 0xff) << (24 - (i % 4) * 8);
    }
    return CryptoJS.lib.WordArray.create(words, bytesLength);
  }

  return {
    encrypt: encrypt,
    decrypt: decrypt,
    wordArrayToByteArray: wordArrayToByteArray,
    byteArrayToWordArray: byteArrayToWordArray,
  };
})();

var arrayToString = arr => arr.reduce((str, code) => str + String.fromCharCode(code), '');
var source = './source/';
var target = './asset/content/';
var decryptedTarget = './source/decrypted/';
var extension = '.arc';
var imagesName = 'images';
var appConfigName = 'app';

var args = process.argv.slice(2);
var action = args.length > 0 ? args[0] : '';
var password = args.length > 1 ? args[1] : 'pass';

// encode files
if (action == 'enc') {
  fs.readdir(source, function (err, files) {
    files.forEach(function (file, index) {
      var name = file.split('.')[0];

      var prefix = (name.match(/^\d{4}/) || [''])[0];
      if (prefix.length > 0) {
        if (!fs.existsSync(target + prefix)) {
          fs.mkdirSync(target + prefix);
        }
        prefix += '/';
      }

      if (name == imagesName || /*name == appConfigName ||*/ (!fs.existsSync(target + prefix + name + extension) && fs.lstatSync(source + file).isFile()) && name.length > 0) {
        //console.log('Encrypt: ' + file);
        var fileContents = fs.readFileSync(source + file);
        var original = Uint8Array.from(fileContents);
        var originalString = arrayToString(original);
        if (name == appConfigName) {
          var json = JSON.parse(originalString);
          originalString = JSON.stringify(json);
        }
        if (name == imagesName) {
          var json = JSON.parse(originalString);
          json = json.sort(function (i1, i2) {
            return i1.date.localeCompare(i2.date) || i1.id.split('_')[2].localeCompare(i2.id.split('_')[2]) || i1.id.localeCompare(i2.id);
          });
          originalString = JSON.stringify(json);
        }

        var date = new Date();
        if (name != imagesName && name != appConfigName) {
          var year = parseInt(name.substring(0, 4), 10);
          var month = parseInt(name.substring(4, 6), 10) - 1;
          var day = parseInt(name.substring(6, 8), 10);
          date = new Date(year, month, day, 0, 0, 0, 0);
        }

        var originalWords = null;
        if (zlibEnabled && (name == imagesName || name == appConfigName)) {
          var deflatedBytes = pako.deflate(Uint8Array.from(Buffer.from(originalString, 'latin1')));
          originalWords = App.byteArrayToWordArray(deflatedBytes);
        } else {
          originalWords = CryptoJS.enc.Latin1.parse(originalString);
        }
        if (originalWords == null) {
          throw new Error('words cannot be null for ' + name);
        }
        var enc = App.encrypt(originalWords, password, name.replaceAll('_', ''), date);
        fs.writeFileSync(target + prefix + name + extension, enc);
      }
    });
  });

  // decode files
} else if (action == 'dec' || action == 'test') {
  var test = action == 'test'

  if (!fs.existsSync(decryptedTarget) && !test) {
    fs.mkdirSync(decryptedTarget)
  }

  fs.readdir(target, function (err, files) {
    files.forEach(function (file, index) {
      var name = file.split('.')[0];

      var prefix = (name.match(/^\d{4}/) || [''])[0];
      if (prefix.length > 0) {
        if (!fs.existsSync(decryptedTarget + prefix) && !test) {
          fs.mkdirSync(decryptedTarget + prefix);
        }
        prefix += '/';
      }

      if (prefix.length > 0 && fs.existsSync(target + prefix)) {
        // process subdirectories
        fs.readdir(target + prefix, function (err, files) {
          files.filter(function (n) { return n.endsWith(extension) }).forEach(function (file, index) {
            var name = file.split('.')[0];
            var webm = name.includes('_m') ? '.webm' : null;
            var webp = name.includes('_p') ? '.webp' : null;
            var jxl = name.includes('_x') ? '.jxl' : null;
            name = name + (webm || webp || jxl);
            if (!fs.existsSync(decryptedTarget + prefix + name) || test) {
              //!test && console.log('Decrypt: ' + file + ' to ' + prefix + name);
              var fileContents = fs.readFileSync(target + prefix + file);
              var original = Uint8Array.from(fileContents);
              var dec = App.decrypt(original, password).toString(CryptoJS.enc.Latin1);

              if (JSON.stringify([0x1a, 0x02]) != JSON.stringify([original[0], original[1]])) {
                throw Error('Invalid ARC header: ' + name);
              }
              var start = [dec.charCodeAt(0), dec.charCodeAt(1)];
              var magic = [];
              if (webm) {
                magic = [0x1a, 0x45];
              } else if (webp) {
                magic = [0x52, 0x49];
              } else if (jxl) {
                magic = [0xff, 0x0a];
              }
              if (JSON.stringify(magic) != JSON.stringify(start)) {
                if (jxl && JSON.stringify([0x00, 0x00]) == JSON.stringify(start)) {
                  console.warn('WARN: unexpected magic bytes for: ' + name + ', probably EXIF');
                } else {
                  throw Error('Invalid magic bytes for: ' + name + ' : ' + start + ' !=' + magic);
                }
              }

              !test && fs.writeFileSync(decryptedTarget + prefix + name, Uint8Array.from(Buffer.from(dec, 'latin1')));
            }
          });
        });
      } else if ((name == imagesName || name == appConfigName) && file.endsWith(extension)) {
        // process images/config
        name = name + '.json';
        //!test && console.log('Decrypt: ' + file + ' to ' + name);
        var fileContents = fs.readFileSync(target + file);
        var original = Uint8Array.from(fileContents);
        if (JSON.stringify([0x1a, 0x02]) != JSON.stringify([original[0], original[1]])) {
          throw Error('Invalid ARC header: ' + name);
        }

        var decWords = App.decrypt(original, password);
        var dec = null;
        if (zlibEnabled) {
          try {
            //dec = App.byteArrayToWordArray(pako.inflate(App.wordArrayToByteArray(decWords))).toString(CryptoJS.enc.Latin1);
            dec = arrayToString(pako.inflate(App.wordArrayToByteArray(decWords)));
          } catch (error) {
            // fallback to uncompressed
            dec = decWords.toString(CryptoJS.enc.Latin1);
          }
        } else {
          dec = decWords.toString(CryptoJS.enc.Latin1);
        }

        if (dec == null) {
          throw new Error('decrypted cannot be null for ' + name);
        }

        if (name.startsWith(appConfigName)) {
          var json = JSON.parse(dec);
          dec = JSON.stringify(json, null, 2);
        }
        if (name.startsWith(imagesName)) {
          var json = JSON.parse(dec);
          json = json.sort(function (i1, i2) {
            return i1.id.localeCompare(i2.id) * -1;
          });
          dec = JSON.stringify(json, null, 2);
        }
        !test && fs.writeFileSync(decryptedTarget + name, Uint8Array.from(Buffer.from(dec, 'latin1')))
      }
    });
  });
} else {
  console.log('crypt.js <enc|dec|test> [password]')
}
