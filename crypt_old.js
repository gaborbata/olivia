var fs = require('fs');
var process = require('process');
var CryptoJS = require('./asset/js/crypto-js.js');

var App = App || (function () {
  var cryptoConfig = {
    keySize: 256,
    ivSize: 128,
    saltSize: 128,
    iterations: 100,
    hasher: CryptoJS.algo.SHA256,
    format: CryptoJS.enc.Base64,
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

  function encrypt(message, password) {
    var salt = CryptoJS.lib.WordArray.random(cryptoConfig.saltSize / 8);
    var iv = CryptoJS.lib.WordArray.random(cryptoConfig.ivSize / 8);
    var encrypted = CryptoJS.AES.encrypt(message, generateKey(password, salt), {
      iv: iv,
      padding: cryptoConfig.padding,
      mode: cryptoConfig.mode
    });
    return salt.concat(iv).concat(encrypted.ciphertext).toString(cryptoConfig.format);
  }

  function decrypt(encrypted, password) {
    var message = cryptoConfig.format.parse(encrypted);
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

  return {
    encrypt: encrypt,
    decrypt: decrypt
  };
})();

var arrayToString = arr => arr.reduce((str, code) => str + String.fromCharCode(code), '');
var source = './source/';
var target = './asset/content/';
var decryptedTarget = './source/decrypted/';
var extension = '.data';
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
        console.log('Encrypt: ' + file);
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
        var enc = App.encrypt(CryptoJS.enc.Latin1.parse(originalString), password);
        fs.writeFileSync(target + prefix + name + extension, enc, { encoding: 'latin1' });
      }
    });
  });

  // decode files
} else if (action == 'dec') {

  if (!fs.existsSync(decryptedTarget)) {
    fs.mkdirSync(decryptedTarget)
  }

  fs.readdir(target, function (err, files) {
    files.forEach(function (file, index) {
      var name = file.split('.')[0];

      var prefix = (name.match(/^\d{4}/) || [''])[0];
      if (prefix.length > 0) {
        if (!fs.existsSync(decryptedTarget + prefix)) {
          fs.mkdirSync(decryptedTarget + prefix);
        }
        prefix += '/';
      }

      if (prefix.length > 0 && fs.existsSync(target + prefix)) {
        // process subdirectories
        fs.readdir(target + prefix, function (err, files) {
          files.forEach(function (file, index) {
            var name = file.split('.')[0];
            var webm = name.includes('_m') ? '.webm' : null;
            var webp = name.includes('_p') ? '.webp' : null;
            var jxl = name.includes('_x') ? '.jxl' : null;
            name = name + (webm || webp || jxl);
            if (!fs.existsSync(decryptedTarget + prefix + name)) {
              console.log('Decrypt: ' + file + ' to ' + prefix + name);
              var fileContents = fs.readFileSync(target + prefix + file);
              var original = Uint8Array.from(fileContents);
              var originalString = arrayToString(original);
              var dec = App.decrypt(originalString, password).toString(CryptoJS.enc.Latin1)
              fs.writeFileSync(decryptedTarget + prefix + name, Uint8Array.from(Buffer.from(dec, 'latin1')))
            }
          });
        });
      } else if (name == imagesName || name == appConfigName) {
        // process images/config
        name = name + '.json';
        console.log('Decrypt: ' + file + ' to ' + name);
        var fileContents = fs.readFileSync(target + file);
        var original = Uint8Array.from(fileContents);
        var originalString = arrayToString(original);
        var dec = App.decrypt(originalString, password).toString(CryptoJS.enc.Latin1);

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
        fs.writeFileSync(decryptedTarget + name, Uint8Array.from(Buffer.from(dec, 'latin1')))
      }
    });
  });
} else {
  console.log('crypt.js <enc|dec> [password]')
}
