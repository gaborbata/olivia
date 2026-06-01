var App = App || (function () {

  /* -------------------------------------------------------------------------- */
  /* local storage definitions                                                  */
  /* -------------------------------------------------------------------------- */
  LSC.setPrefix('');
  var appTokenKey = 'app_token';
  var appThemeKey = 'app_theme';
  var appTokenInMemory = '';
  var cacheBucket = 'cache__'
  var cacheExpirationMinutes = 10;
  var dataExt = ARC.extension;
  var devMode = false;

  /* -------------------------------------------------------------------------- */
  /* navigation variables/functions                                             */
  /* -------------------------------------------------------------------------- */
  function setNavLoading(loadingFlag) {
    var navigation = document.querySelector('.navigation');
    if (loadingFlag) {
      navigation.classList.add('navigation-loading');
    } else {
      navigation.classList.remove('navigation-loading');
    }
  }

  /* -------------------------------------------------------------------------- */
  /* page variables/functions                                                   */
  /* -------------------------------------------------------------------------- */
  function getResponseBytes(response) {
    if ('bytes' in Response.prototype) {
      return response.bytes();
    } else {
      return response.arrayBuffer()
        .then(function (buffer) {
          return buffer ? new Uint8Array(buffer) : null;
        });
    }
  }

  var pages = new Map(Array.from(document.querySelectorAll('.page')).map(function (page) {
    return [page.id, page];
  }));

  var appConfig = {};
  var images = [];
  var imageTimeoutId = null;
  var imageDebounceDelay = 200;
  var requestedImageIndex = null;
  var useObjectUrl = true;
  var objectUrlsToRevoke = new Set();

  function showElement(element, visible) {
    if (visible) {
      element.classList.remove('hidden');
    } else {
      element.classList.add('hidden');
    }
  }

  function showElements(elements, visible) {
    Array.from(elements).forEach(function (element) {
      showElement(element, visible);
    });
  }

  function isPageVisible(pageId) {
    return !pages.get(pageId).classList.contains('hidden');
  }

  function showPage(pageId) {
    if (getDisplayStyle(navigationToggle) !== 'none') {
      navigationList.style.display = 'none';
    }
    showElement(document.querySelector('#fullscreen').closest('.navigation-item'), pageId == 'image');

    pages.forEach(function (page, key) {
      showElement(page, false);
    });
    showElement(pages.get(pageId), true);
  }

  function clearContentUrls() {
    if (useObjectUrl) {
      objectUrlsToRevoke.forEach(function (url) { URL.revokeObjectURL(url) });
      objectUrlsToRevoke.clear();
    }
  }

  function generateContentUrl(type, decrypted) {
    clearContentUrls();
    if (useObjectUrl) {
      var blob = new Blob([wordArrayToByteArray(decrypted)], { type: type });
      var url = URL.createObjectURL(blob);
      objectUrlsToRevoke.add(url);
      return url;
    } else {
      return 'data:' + type + ';base64,' + decrypted.toString(CryptoJS.enc.Base64);
    }
  }

  function prepareImagePage(index) {
    requestedImageIndex = index;
    clearContentUrls();
    var entry = images[index];
    var page = pages.get('image');

    var img = page.querySelector('img');
    var video = page.querySelector('video');
    showElement(video, false);
    showElement(img, true);

    if (document.fullscreenElement == video) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }

    img.src = 'asset/image/loading.webp';
    img.alt = entry.title;
    img.onerror = function () {
      this.onerror = null;
      this.src = 'asset/image/forbidden.webp';
    };

    video.poster = 'asset/image/loading.webp';
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('controls');
    video.onerror = function () {
      this.onerror = null;
      this.poster = 'asset/image/forbidden.webp';
      this.removeAttribute('src');
      this.removeAttribute('controls');
    };
    video.onloadedmetadata = function () {
      this.onloadedmetadata = null;
      this.setAttribute('controls', '');
    };

    page.querySelector('.image-title').textContent = entry.title;
    page.querySelector('.image-description').textContent = (entry.description || '') + ' (' + entry.date + ')';
    var buttons = Array.from(page.querySelectorAll('.pagination .button'));
    buttons.forEach(function (button) {
      button.href = '#image-' + index;
      button.classList.add('button-outline');
      button.setAttribute('disabled', true);
    });

    if (index > 0) {
      buttons[0].href = '#image-0';
      buttons[0].classList.remove('button-outline');
      buttons[0].removeAttribute('disabled');
      buttons[1].href = '#image-' + (index - 1);
      buttons[1].classList.remove('button-outline');
      buttons[1].removeAttribute('disabled');
    }
    if (index < (images.length - 1)) {
      buttons[2].href = '#image-' + (index + 1);
      buttons[2].classList.remove('button-outline');
      buttons[2].removeAttribute('disabled');
      buttons[3].href = '#image-' + (images.length - 1);
      buttons[3].classList.remove('button-outline');
      buttons[3].removeAttribute('disabled');
    }
    // fetch image data
    var id = entry.id.split('.');
    var name = id[0];
    var type = id[1];
    var prefix = name.substring(0, 4);

    imageTimeoutId != null && clearTimeout(imageTimeoutId);
    imageTimeoutId = setTimeout(function () {
      fetch(appConfig.storage + '/' + prefix + '/' + name + '.' + dataExt)
        .then(function (response) {
          return response.ok ? getResponseBytes(response) : null;
        })
        .then(function (response) {
          try {
            if (!response) {
              throw new Error('could not load resource: ' + name);
            }
            if (requestedImageIndex != index) {
              return;
            }
            var appToken = appTokenInMemory;
            var token = CryptoJS.AES.decrypt(appToken, appTokenKey).toString(CryptoJS.enc.Utf8);
            var decrypted = decrypt(response, token);

            if (type == 'webm') {
              video.removeAttribute('poster');
              video.src = generateContentUrl('video/' + type, decrypted);
              showElement(img, false);
              showElement(video, true);
            } else if (type == 'jxl') {
              if (jxlSupported) {
                img.src = generateContentUrl('image/' + type, decrypted);
              } else {
                var buffer = wordArrayToByteArray(decrypted);
                decodeJxlBufferToImageData(buffer, index)
                  .then(function (data) {
                    if (requestedImageIndex == data.meta) {
                      if (useObjectUrl) {
                        imageDataToDataUrl(data.imageData, function (blob) {
                          clearContentUrls();
                          var url = URL.createObjectURL(blob);
                          objectUrlsToRevoke.add(url);
                          img.src = url;
                        })
                      } else {
                        img.src = imageDataToDataUrl(data.imageData);
                      }
                    }
                  })
                  .catch(function (error) {
                    if (requestedImageIndex == error.meta) {
                      handleImageLoadingError(error, img, video, false);
                    }
                  });
              }
            } else if (type == 'webp') {
              img.src = generateContentUrl('image/' + type, decrypted);
            } else {
              handleImageLoadingError('Unsupported type: ' + type, img, video, false);
            }
          } catch (error) {
            handleImageLoadingError(error, img, video, true);
          }
        })
        .catch(function (error) {
          if (requestedImageIndex == index) {
            handleImageLoadingError(error, img, video, true);
          }
        });
    }, imageDebounceDelay);
  }

  function handleImageLoadingError(error, img, video, showErrorPage) {
    console.error(error);
    img.src = 'asset/image/forbidden.webp';
    video.poster = 'asset/image/forbidden.webp';
    if (showErrorPage) {
      showPage('error');
    }
  }

  // fullscreen
  var imageContainer = document.querySelector('.image-container');

  document.querySelector('#fullscreen').addEventListener('click', function (event) {
    event.preventDefault();
    toggleFullscreen();
  });

  document.querySelector('.close-button').addEventListener('click', function () {
    leaveFullscreen();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key == 'Escape') {
      leaveFullscreen();
    } else if (event.key == 'F') {
      toggleFullscreen();
    }
  });

  function toggleFullscreen() {
    if (isPageVisible('image')) {
      imageContainer.classList.toggle('fullscreen');
    }
  }

  function leaveFullscreen() {
    imageContainer.classList.remove('fullscreen');
  }

  // random image
  document.querySelector('#random-image').addEventListener('click', function (event) {
    event.preventDefault();
    for (var i = 0; i < 3; i++) {
      var randomIndex = Math.floor(Math.random() * images.length);
      if (randomIndex != requestedImageIndex) {
        changeHash('#image-' + randomIndex);
        break;
      }
    }
  });

  function convertToJpeg(blob) {
    if (blob.type == 'image/jpeg' || !blob.type.startsWith('image/')) {
      return blob;
    }
    return createImageBitmap(blob)
      .then(function (img) {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return new Promise(function (r) {
          return canvas.toBlob(r, 'image/jpeg', 0.97);
        });
      });
  }

  function prepareArchiveList() {
    //<li><a href="#template">template</a></li>
    var archiveList = document.querySelector('.archive-list');
    if (archiveList.children.length == 0) {
      var prevYear = '';
      var uniqueTitles = new Set();
      images.forEach(function (image, index) {
        var dateComponents = images[index].date.split('-')
        var year = dateComponents[0];
        var month = parseInt(dateComponents[1]);
        var day = parseInt(dateComponents[2]);
        if (year != prevYear) {
          prevYear = year;
          var newYearItem = document.createElement('li');
          newYearItem.classList.add('year');
          newYearItem.textContent = year;
          if (archiveList.children.length > 0) {
            var clonedArchiveList = archiveList.cloneNode(false);
            archiveList.after(clonedArchiveList);
            archiveList = clonedArchiveList;
          }
          archiveList.appendChild(newYearItem);
        }

        var uniqueTitle = month + '/' + day + ': ' + image.title.replace(/\s*#\d+/g, '');
        if (!uniqueTitles.has(uniqueTitle)) {
          uniqueTitles.add(uniqueTitle);
          var newListItem = document.createElement('li');
          var newLink = document.createElement('a');
          newLink.href = '#image-' + index;
          newLink.textContent = uniqueTitle;
          newListItem.appendChild(newLink);
          archiveList.appendChild(newListItem);
        }
      });
      uniqueTitles.clear();
    }
  }

  /* -------------------------------------------------------------------------- */
  /* navigation toggle for mobile view                                          */
  /* -------------------------------------------------------------------------- */
  var navigationToggle = document.getElementById('navigation-toggle');
  var navigationList = document.getElementById('navigation-list');

  function getDisplayStyle(element) {
    var displayStyle;
    if (element.currentStyle) {
      displayStyle = element.currentStyle.display;
    } else if (window.getComputedStyle) {
      displayStyle = window.getComputedStyle(element, null).getPropertyValue('display');
    }
    return displayStyle;
  }

  function navigationToggleHandler(event) {
    event.preventDefault();
    if (getDisplayStyle(navigationList) === 'none') {
      navigationList.style.display = 'block';
    } else {
      navigationList.style.display = 'none';
    }
  }

  function navigationResizeHandler() {
    if (getDisplayStyle(navigationToggle) === 'none') {
      navigationList.style.display = 'block';
    } else {
      navigationList.style.display = 'none';
    }
  }

  if (!!navigationToggle) {
    navigationToggle.addEventListener('click', navigationToggleHandler);
  }
  if (!!navigationList) {
    window.addEventListener('resize', navigationResizeHandler);
  }

  document.querySelectorAll('.navigation-link').forEach(function (el) {
    el.addEventListener('click', function () {
      if (getDisplayStyle(navigationToggle) === 'block') {
        navigationList.style.display = 'none';
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* app theme handling                                                         */
  /* -------------------------------------------------------------------------- */
  var bodyElement = document.querySelector('body');
  var appTheme = LSC.get(appThemeKey);
  if (appTheme == 'dark') {
    bodyElement.classList.add('dark');
  } else {
    bodyElement.classList.remove('dark');
  }
  document.querySelector('#dark-mode').addEventListener('click', function (event) {
    event.preventDefault();
    var isDarkMode = bodyElement.classList.toggle('dark');
    LSC.set(appThemeKey, isDarkMode ? 'dark' : 'light');
  });

  var fadeInPage = setInterval(function () {
    var opacity = parseFloat(bodyElement.style.opacity || 0);
    opacity += 0.1;
    bodyElement.style.opacity = Math.min(opacity, 1.0);
    if (opacity >= 1.0) {
      clearInterval(fadeInPage);
    }
  }, 10);

  /* -------------------------------------------------------------------------- */
  /* keyboard navigation for images (left, right arrow keys)                    */
  /* -------------------------------------------------------------------------- */
  var pagination = document.getElementsByClassName('pagination');
  pagination = pagination.length > 0 ? pagination[0] : null;

  function navigateWithButton(idx) {
    if (isPageVisible('image')) {
      var href = pagination.getElementsByClassName('button')[idx].href;
      if (!!href) {
        window.location = href;
      }
    }
  }

  document.onkeydown = function (evt) {
    if (!pagination || evt.target.nodeName == 'INPUT' || evt.altKey || evt.shiftKey || evt.ctrlKey || evt.metaKey) {
      return;
    } else if (evt.key == 'ArrowLeft') {
      navigateWithButton(1);
    } else if (evt.key == 'ArrowRight') {
      navigateWithButton(2);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* setup touch swipe navigation for images (left, right)                      */
  /* -------------------------------------------------------------------------- */
  var touchstartX = 0;
  var touchstartY = 0;
  var touchendX = 0;
  var touchendY = 0;
  var startTime = new Date();
  var endTime = new Date();
  var gestureZone = document.querySelector('body');

  function isUserScaled() {
    if (window.visualViewport) {
      return Math.abs(window.visualViewport.scale - 1.0) > 0.01;
    }
    return false;
  }

  gestureZone.addEventListener('touchstart', function (event) {
    startTime = new Date();
    touchstartX = event.changedTouches[0].screenX;
    touchstartY = event.changedTouches[0].screenY;
  }, false);

  gestureZone.addEventListener('touchend', function (event) {
    endTime = new Date();
    touchendX = event.changedTouches[0].screenX;
    touchendY = event.changedTouches[0].screenY;
    handleGesture(event);
  }, false);

  function handleGesture() {
    if (isUserScaled() || !isPageVisible('image')) {
      return;
    }
    var deltaT = endTime - startTime;
    var deltaX = Math.abs(touchstartX - touchendX);
    var deltaY = Math.abs(touchstartY - touchendY);
    if (deltaX > deltaY && deltaX > 50 && deltaT < 400 && deltaY < 100) {
      if (touchendX < touchstartX) {
        navigateWithButton(2);
      } else if (touchendX > touchstartX) {
        navigateWithButton(1);
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /* crypto functions                                                           */
  /* -------------------------------------------------------------------------- */
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

  function encrypt(message, password) {
    var salt = CryptoJS.lib.WordArray.random(cryptoConfig.saltSize / 8);
    var iv = CryptoJS.lib.WordArray.random(cryptoConfig.ivSize / 8);
    var encrypted = CryptoJS.AES.encrypt(message, generateKey(password, salt), {
      iv: iv,
      padding: cryptoConfig.padding,
      mode: cryptoConfig.mode
    });
    var encryptedFileBytes = wordArrayToByteArray(salt.concat(iv).concat(encrypted.ciphertext));
    var arcHeaderBytes = ARC.createArcHeader(encryptedFileBytes);
    var endOfFile = new Uint8Array(ARC.eof);
    return new Uint8Array(Array.from(arcHeaderBytes).concat(Array.from(encryptedFileBytes)).concat(endOfFile));
  }

  function decrypt(encrypted, password) {
    if (encrypted[0] != ARC.memberFlag || encrypted[1] != ARC.storeMethod) {
      throw new Error('invalid/unsupported ARC header');
    }

    var message = byteArrayToWordArray(encrypted, ARC.headerSize, ARC.eofSize);

    var words = message.words;

    var saltSize = cryptoConfig.saltSize / 32;
    var ivSize = cryptoConfig.ivSize / 32;
    var salt = CryptoJS.lib.WordArray.create(words.slice(0, saltSize));
    var iv = CryptoJS.lib.WordArray.create(words.slice(saltSize, saltSize + ivSize));

    words.splice(0, saltSize + ivSize);
    message.sigBytes -= (cryptoConfig.saltSize / 8 + cryptoConfig.ivSize / 8);

    var params = CryptoJS.lib.CipherParams.create({ ciphertext: message });

    var decrypted = CryptoJS.AES.decrypt(params, generateKey(password, salt), {
      iv: iv,
      padding: cryptoConfig.padding,
      mode: cryptoConfig.mode
    });

    return decrypted;
  }

  function wordArrayToByteArray(wordArray) {
    var len = wordArray.sigBytes;
    var words = wordArray.words;
    var result = new Uint8Array(len);
    var i = 0, j = 0;
    while (true) {
      if (i == len)
        break;
      var w = words[j++];
      result[i++] = (w & 0xff000000) >>> 24;
      if (i == len)
        break;
      result[i++] = (w & 0x00ff0000) >>> 16;
      if (i == len)
        break;
      result[i++] = (w & 0x0000ff00) >>> 8;
      if (i == len)
        break;
      result[i++] = (w & 0x000000ff);
    }
    return result;
  }

  function wordArrayToByteArrayV1(wordArray) {
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
    var words = new Array(Math.ceil(bytesLength / 4));

    var i = 0;
    var alignedLength = bytesLength - (bytesLength % 4);

    for (; i < alignedLength; i += 4) {
      var word = (bytes[i + offset] << 24) |
        ((bytes[i + offset + 1] & 0xff) << 16) |
        ((bytes[i + offset + 2] & 0xff) << 8) |
        (bytes[i + offset + 3] & 0xff);
      words[i >>> 2] = word;
    }

    // handle remaining bytes
    if (i < bytesLength) {
      var word = 0;
      var shift = 24;
      var remaining = bytesLength - i;

      for (var j = 0; j < remaining; j++) {
        word |= (bytes[i + offset + j] & 0xff) << shift;
        shift -= 8;
      }
      words[i >>> 2] = word;
    }

    return CryptoJS.lib.WordArray.create(words, bytesLength);
  }

  function byteArrayToWordArrayV1(bytes, offset, eofSize) {
    var offset = offset || 0;
    var eofSize = eofSize || 0;
    var bytesLength = bytes.length - offset - eofSize;
    var words = [];
    for (var i = 0; i < bytesLength; i++) {
      words[(i >>> 2)] |= (bytes[i + offset] & 0xff) << (24 - (i % 4) * 8);
    }
    return CryptoJS.lib.WordArray.create(words, bytesLength);
  }

  /* -------------------------------------------------------------------------- */
  /* login/logout handling                                                      */
  /* -------------------------------------------------------------------------- */
  function fetchConfig(url, appToken, cacheKey) {
    var cachedFetch = null;
    var cachedConfig = null;
    LSC.setBucket(cacheBucket);
    var cachedResponseBase64 = LSC.get(cacheKey);
    LSC.resetBucket();
    if (cachedResponseBase64 && cachedResponseBase64.length > 0) {
      if (typeof Uint8Array.fromBase64 === 'function') {
        cachedConfig = Uint8Array.fromBase64(cachedResponseBase64);
      } else {
        cachedConfig = wordArrayToByteArray(CryptoJS.enc.Base64.parse(cachedResponseBase64));
      }
    }
    if (cachedConfig) {
      cachedFetch = new Promise(function (resolve) {
        resolve(cachedConfig);
      });
    } else {
      cachedFetch = fetch(url)
        .then(function (response) {
          return response.ok ? getResponseBytes(response) : null;
        })
        .then(function (response) {
          if (response) {
            var responseBase64 = '';
            if (typeof Uint8Array.prototype.toBase64 === 'function') {
              responseBase64 = response.toBase64();
            } else {
              responseBase64 = byteArrayToWordArray(response).toString(CryptoJS.enc.Base64);
            }
            LSC.setBucket(cacheBucket);
            LSC.set(cacheKey, responseBase64, cacheExpirationMinutes);
            LSC.resetBucket();
          }
          return response;
        });
    }

    return cachedFetch
      .then(function (response) {
        if (!response) {
          var error = new Error('could not load file: ' + url);
          error.loadError = true;
          throw error;
        }
        var token = CryptoJS.AES.decrypt(appToken, appTokenKey).toString(CryptoJS.enc.Utf8);

        // show last update timestamp
        var arcHeader = ARC.parseArcHeader(response);
        if (arcHeader.filename == 'IMAGES') {
          var date = arcHeader.dateField.map(function (field) {
            return field.toString().padStart(2, '0');
          }).join('-');
          var time = arcHeader.timeField.map(function (field) {
            return field.toString().padStart(2, '0');
          }).join(':');
          var lastUpdate = document.querySelector('.image-container .image-last-update');
          lastUpdate.querySelector('.date-time').textContent = date + ' ' + time;
          setTimeout(function() {
            lastUpdate.style.display = 'none';
          }, 5000);
        }

        var decrypted = decrypt(response, token);
        var decryptedString = null;
        try {
          // assume zlib is used for config files
          decryptedString = pako.inflate(wordArrayToByteArray(decrypted), { to: 'string' });
        } catch (error) {
          // fallback to uncompressed
          decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
        }

        var json = JSON.parse(decryptedString);
        if (Object.keys(json).length == 0) {
          throw new Error('config must not be empty: ' + url);
        }
        return json;
      });
  }

  var loginRedirectHash = null;
  function login(appToken) {
    setNavLoading(true);

    var noCache = '?date=' + new Date().toISOString().replaceAll(/\D/g, '').slice(0, 12);

    var precondition = new Promise(function (resolve, reject) {
      if (!appToken || appToken.length == 0) {
        reject(new Error('app token must be provided'));
      } else {
        resolve(appToken);
      }
    });

    precondition
      .then(function () {
        return fetchConfig('asset/content/app.' + dataExt + noCache, appToken, 'app_' + dataExt)
          .then(function (configData) {
            appConfig = configData;
            if (devMode) {
              appConfig.storage = 'asset/content';
            }
          });
      })
      .then(function () {
        return fetchConfig(appConfig.storage + '/images.' + dataExt + noCache, appToken, 'images_' + dataExt)
          .then(function (imagesData) {
            images = imagesData;
            images = images.sort(function (i1, i2) {
              return i1.date.localeCompare(i2.date) || i1.id.split('_')[2].localeCompare(i2.id.split('_')[2]) || i1.id.localeCompare(i2.id);
            });
          });
      })
      .then(function () {
        setNavLoading(false);
        showElement(document.querySelector('#login-warning'), false);
        appTokenInMemory = appToken;
        LSC.set(appTokenKey, appToken);
        showElement(document.querySelector('.navigation-toggle'), true);
        showElements(document.querySelectorAll('.navigation-item'), true);
        if (window.location.hash == '#login') {
          //changeHash(loginRedirectHash || ('#image-' + (images.length - 1)));
          changeHash(loginRedirectHash || '#image-latest');
        } else {
          changeHash(window.location.hash);
        }
        loginRedirectHash = null;
      })
      .catch(function (error) {
        setNavLoading(false);
        if (error.loadError && appToken && appToken.length > 0) {
          console.error(error);
          showPage('error');
          return;
        }

        loginRedirectHash = ['#login', '#logout'].indexOf(window.location.hash) != -1 ? loginRedirectHash : window.location.hash;

        if (appToken && appToken.length > 0) {
          console.error(error);
          showElement(document.querySelector('#login-warning'), true);
        }
        showElement(document.querySelector('.navigation-toggle'), false);
        showElements(document.querySelectorAll('.navigation-item'), false);

        appConfig = {};
        images = [];
        appTokenInMemory = '';
        LSC.remove(appTokenKey);
        LSC.remove(appThemeKey);
        bodyElement.classList.remove('dark');
        changeHash('#login');
      });
  }

  var form = document.querySelector('#login-form');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var password = form.password.value;
    var token = null;
    if (!!password && password.length > 0) {
      token = CryptoJS.AES.encrypt(form.password.value, appTokenKey).toString();
    }
    form.password.value = '';
    login(token);
  });

  function logout() {
    loginRedirectHash = null;
    appConfig = {};
    images = [];
    appTokenInMemory = '';
    LSC.remove(appTokenKey);
    LSC.remove(appThemeKey);
    LSC.setBucket(cacheBucket);
    LSC.flush();
    LSC.resetBucket();
    bodyElement.classList.remove('dark');
    window.location.replace(document.querySelector('.navigation-title').href);
  }

  /* -------------------------------------------------------------------------- */
  /* location hash functions                                                    */
  /* -------------------------------------------------------------------------- */
  function changeHash(hash) {
    if (window.location.hash == hash) {
      hashchangeEventHandler();
    } else {
      window.location.hash = hash;
    }
  }

  function hashchangeEventHandler() {
    var hash = window.location.hash;
    if (hash == '#login' && images.length == 0) {
      showPage('login');
    } else if (hash == '#logout') {
      logout();
    } else if (hash == '#archive' && images.length > 0) {
      setNavLoading(true);
      prepareArchiveList();
      setNavLoading(false);
      showPage('archive');
    } else if (hash == '#calendar' && images.length > 0) {
      setNavLoading(true);
      initCalendar();
      setNavLoading(false);
      showPage('calendar');
    } else if (hash == '#dev-mode') {
      devMode = true;
      localStorage.clear();
      document.querySelector('.navigation .img').style.filter = 'hue-rotate(280deg)';
      changeHash("#login");
      login(appTokenInMemory);
    } else if (hash == '#download') {
      if (!document.querySelector('#download-content')) {
        var slink = document.createElement('a');
        slink.className = 'hidden';
        var link = document.createElement('a');
        link.id = 'download-content';
        link.href = '#';
        link.textContent = 'v';
        link.style = 'padding:4px 18px;border-radius:4px;background-color:lightyellow;border:2px solid lightgray;margin:0 0 0 2px;color:black;opacity:0.8;display:inline-block;vertical-align:baseline;height:36px;';
        document.querySelector('#image .pagination').appendChild(link);
        document.querySelector('#image .pagination').appendChild(slink);
        link.addEventListener('click', function (event) {
          event.preventDefault();
          var container = document.querySelector('#image .image-container');
          var imgEl = container.querySelector('img');
          var vidEl = container.querySelector('video');
          var desc = container.querySelector('.image-description').textContent.split(' ').slice(-1).join('').replace(/\D/g, '-');
          var url = imgEl.classList.contains('hidden') ? vidEl.src : imgEl.src;
          fetch(url)
            .then(function (response) {
              return response.blob();
            })
            .then(function (blob) {
              return convertToJpeg(blob);
            })
            .then(function (blob) {
              var fileName = document.title.toLowerCase() + desc + Math.random().toString(16).slice(2) + '-' + blob.type.replaceAll('/', '.');
              var downloadUrl = URL.createObjectURL(blob);
              objectUrlsToRevoke.add(downloadUrl);
              slink.href = downloadUrl;
              slink.download = fileName;
              slink.click();
            });
        });
      }
    } else if (hash.startsWith('#image-') && images.length > 0) {
      var match = hash.match(/#image-([0-9]+)/);
      var index = Math.min(match ? parseInt(match[1]) : (images.length - 1), images.length - 1);
      prepareImagePage(index);
      showPage('image');
    } else if (images.length > 0) {
      //changeHash('#image-' + (images.length - 1));
      changeHash('#image-latest');
    } else {
      changeHash('#login');
    }
  }

  addEventListener('hashchange', hashchangeEventHandler);

  /* -------------------------------------------------------------------------- */
  /* calendar                                                            */
  /* -------------------------------------------------------------------------- */
  var currentDate = null;
  var calendarMinYear = null;
  var calendarMaxYear = null;

  function initCalendar() {
    if (!!currentDate) {
      return;
    }
    currentDate = new Date(images[images.length - 1].date);
    populateYearSelector();
    renderCalendar(currentDate);

    document.getElementById('prev-month').addEventListener('click', function () {
      var prevMonth = new Date(currentDate.getTime());
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      if (isValidDate(prevMonth)) {
        currentDate = prevMonth;
        updateSelectorsFromDate();
        renderCalendar(currentDate);
      }
    });

    document.getElementById('next-month').addEventListener('click', function () {
      var nextMonth = new Date(currentDate.getTime());
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      if (isValidDate(nextMonth)) {
        currentDate = nextMonth;
        updateSelectorsFromDate();
        renderCalendar(currentDate);
      }
    });

    document.getElementById('latest-month').addEventListener('click', function () {
      currentDate = new Date(images[images.length - 1].date);
      updateSelectorsFromDate();
      renderCalendar(currentDate);
    });

    document.getElementById('month-selector').addEventListener('change', function (e) {
      currentDate.setMonth(parseInt(e.target.value));
      renderCalendar(currentDate);
    });

    document.getElementById('year-selector').addEventListener('change', function (e) {
      currentDate.setFullYear(parseInt(e.target.value));
      renderCalendar(currentDate);
    });
  }

  function isValidDate(date) {
    return date.getFullYear() <= calendarMaxYear && date.getFullYear() >= calendarMinYear;
  }

  function populateYearSelector() {
    var yearSelector = document.getElementById('year-selector');
    calendarMinYear = parseInt(images[0].date.split('-')[0]);
    calendarMaxYear = parseInt(images[images.length - 1].date.split('-')[0]);
    for (var year = calendarMinYear; year <= calendarMaxYear; year++) {
      var option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearSelector.appendChild(option);
    }
    updateSelectorsFromDate();
  }

  function updateSelectorsFromDate() {
    document.getElementById('month-selector').value = currentDate.getMonth();
    document.getElementById('year-selector').value = currentDate.getFullYear();
  }

  function renderCalendar(date) {
    var calendarGrid = document.getElementById('calendar-grid');
    calendarGrid.innerHTML = '';
    updateSelectorsFromDate();
    var dayNames = (calendarGrid.dataset.dayNames || 'Mon,Tue,Wed,Thu,Fri,Sat,Sun').split(',');
    dayNames.forEach(function (day) {
      var dayHeader = document.createElement('div');
      dayHeader.className = 'calendar-day-header';
      dayHeader.textContent = day;
      calendarGrid.appendChild(dayHeader);
    });

    var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    var daysInMonth = lastDay.getDate();

    var firstDayOfWeek = firstDay.getDay();
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    var prevMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();

    for (var i = firstDayOfWeek - 1; i >= 0; i--) {
      var dayElement = createDayElement(prevMonthLastDay - i, true, date, false);
      calendarGrid.appendChild(dayElement);
    }

    var today = new Date();
    for (var i = 1; i <= daysInMonth; i++) {
      var isToday = today.getDate() === i &&
        today.getMonth() === date.getMonth() &&
        today.getFullYear() === date.getFullYear();
      var dayElement = createDayElement(i, false, date, isToday);
      calendarGrid.appendChild(dayElement);
    }

    var totalCells = 42;
    var daysSoFar = firstDayOfWeek + daysInMonth;
    var nextMonthDays = totalCells - daysSoFar;

    for (var i = 1; i <= nextMonthDays; i++) {
      var dayElement = createDayElement(i, true, date, false);
      calendarGrid.appendChild(dayElement);
    }
  }

  function createDayElement(dayNumber, isOtherMonth, currentMonthDate, isToday) {
    var dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';

    if (isOtherMonth) {
      dayElement.classList.add('other-month');
    }

    if (isToday) {
      dayElement.classList.add('today');
    }

    var dayNumberElement = document.createElement('div');
    dayNumberElement.className = 'day-number';
    dayNumberElement.textContent = dayNumber;
    dayElement.appendChild(dayNumberElement);

    if (!isOtherMonth) {
      var uniqueEvents = new Map();
      var currentDate = currentMonthDate.getFullYear() + '-' + ('0' + (currentMonthDate.getMonth() + 1)).slice(-2) + '-' + ('0' + dayNumber).slice(-2);
      images.forEach(function (event, index) {
        if (currentDate == event.date) {
          var cleanTitle = event.title.replace(/\s*#\d+/g, '');
          var uniqueKey = event.date + ':' + cleanTitle;
          if (!uniqueEvents.has(uniqueKey)) {
            uniqueEvents.set(uniqueKey, {
              title: cleanTitle,
              index: index
            });
            return;
          }
        }
      });

      uniqueEvents.forEach(function (event) {
        var eventElement = document.createElement('a');
        eventElement.className = 'event';
        eventElement.textContent = event.title;
        eventElement.title = event.title;
        eventElement.href = '#image-' + event.index;
        dayElement.appendChild(eventElement);
      });
    }

    return dayElement;
  }

  /* -------------------------------------------------------------------------- */
  /* jxl support                                                                */
  /* -------------------------------------------------------------------------- */
  var jxlSupported = false;
  function checkJxlSupport() {
    var testImage = 'data:image/jxl;base64,/woAkAEB2ABrTgsAgAqVUcYNXs71fPmhw2LaxnWGttq2AAAAAB7AvxLGZnthkJBwBBsXTdwcVHP7gMhQSQI=';
    var img = new Image();
    img.onload = function () {
      var result = (img.width > 0) && (img.height > 0);
      jxlSupported = result;
    };
    img.onerror = function () {
      jxlSupported = false;
    };
    img.src = testImage;
  }

  var decodeJxlSrcToImageData = function (source, meta) {
    return fetch(source)
      .then(function (res) {
        return res.arrayBuffer();
      }).then(function (buffer) {
        return decodeJxlBufferToImageData(buffer, meta);
      })
  }

  var jxlWorker = null;
  var decodeJxlBufferToImageData = function (imageBuffer, meta) {
    if (jxlWorker == null) {
      jxlWorker = new Worker('asset/js/jxl/jxl_dec.min.js');
    }
    return new Promise(function (resolve, reject) {
      var messageHandler = function (message) {
        if (message.data.meta == meta) {
          jxlWorker.removeEventListener('message', messageHandler);
          if (!!message.data.error) {
            var error = new Error(message.data.error);
            error.meta = message.data.meta
            reject(error)
          } else {
            resolve(message.data)
          }
        }
      };
      jxlWorker.addEventListener('message', messageHandler);
      jxlWorker.postMessage({ imageBuffer: imageBuffer, meta: meta });
    });
  };

  var decodeJxlBufferToImageDataNewWorker = function (imageBuffer, meta) {
    return new Promise(function (resolve, reject) {
      var worker = new Worker('asset/js/jxl/jxl_dec.min.js');
      var messageHandler = function (message) {
        if (message.data.meta == meta) {
          if (!!message.data.error) {
            var error = new Error(message.data.error);
            error.meta = message.data.meta
            reject(error)
          } else {
            resolve(message.data)
          }
          worker.terminate();
        }
      };
      worker.addEventListener('message', messageHandler);
      worker.postMessage({ imageBuffer: imageBuffer, meta: meta });
    });
  };

  var imageDataToDataUrl = function (imageData, blobCallback, type, quality) {
    var canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    var imageType = type || 'image/jpeg';
    var imageQuality = quality || 0.97;
    if (!!blobCallback) {
      return canvas.toBlob(blobCallback, imageType, imageQuality);
    } else {
      return canvas.toDataURL(imageType, imageQuality);
    }
  };

  function isWebAssemblySupported() {
    return typeof WebAssembly === 'object';
  }

  function testJxlDecode() {
    var jxlImage = 'data:image/jxl;base64,/woAkAEB2ABrTgsAgAqVUcYNXs71fPmhw2LaxnWGttq2AAAAAB7AvxLGZnthkJBwBBsXTdwcVHP7gMhQSQI='
    decodeJxlSrcToImageData(jxlImage, 'test')
      .then(function (data) {
        console.log('jxl', jxlImage)
        console.log('meta', data.meta);
        console.log('decoded', imageDataToDataUrl(data.imageData));
      })
      .catch(function (error) {
        console.error('error', error);
      });
  }

  /* -------------------------------------------------------------------------- */
  /* initialize page                                                            */
  /* -------------------------------------------------------------------------- */
  function checkBrowserSupport() {
    var testImage = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
    var browserWarning = document.querySelector('#browser-warning');
    var img = new Image();
    img.onload = function () {
      var result = (img.width > 0) && (img.height > 0) && isWebAssemblySupported();
      showElement(browserWarning, !result);
    };
    img.onerror = function () {
      showElement(browserWarning, true);
    };
    img.src = testImage;
  }

  checkBrowserSupport();
  checkJxlSupport();
  login(LSC.get(appTokenKey));

  /* -------------------------------------------------------------------------- */
  /* public functions                                                           */
  /* -------------------------------------------------------------------------- */
  return {
    version: '2.0',
    jxlSupported: jxlSupported,
    testJxlDecode: testJxlDecode,
    isWebAssemblySupported: isWebAssemblySupported
  };

})();
