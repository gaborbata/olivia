/**
 * lsc library based on lscache library, with customizations
 * Copyright (c) 2011, 2025, Pamela Fox, Gabor Bata
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module !== "undefined" && module.exports) {
    // CommonJS/Node module
    module.exports = factory();
  } else {
    // Browser globals
    root.LSC = factory();
  }
}(this, function () {
  // Prefix for all lscache keys
  var defaultPrefix = 'lsc__';
  var cachePrefix = defaultPrefix;

  // Suffix for the key name on the expiration items in localStorage
  var cacheSuffix = '__exp';

  // expiration date radix (set to Base-36 for most space savings)
  var expiryRadix = 10;

  // time resolution in milliseconds
  var expiryMilliseconds = 60 * 1000;

  // ECMAScript max Date (epoch + 1e8 days)
  var maxDate = calculateMaxDate(expiryMilliseconds);

  var cachedStorage;
  var cacheBucket = '';
  var warnings = false;

  // Determines if localStorage is supported in the browser;
  // result is cached for better performance instead of being run each time.
  // Feature detection is based on how Modernizr does it;
  // it's not straightforward due to FF4 issues.
  // It's not run at parse-time as it takes 200ms in Android.
  function supportsStorage() {
    var key = '__test__';
    var value = key;

    if (cachedStorage !== undefined) {
      return cachedStorage;
    }

    // some browsers will throw an error if you try to access local storage (e.g. brave browser)
    // hence check is inside a try/catch
    try {
      if (!localStorage) {
        return false;
      }
    } catch (ex) {
      return false;
    }

    try {
      setItem(key, value);
      removeItem(key);
      cachedStorage = true;
    } catch (e) {
      // If we hit the limit, and we don't have an empty localStorage then it means we have support
      if (isOutOfSpace(e) && localStorage.length) {
        cachedStorage = true; // just maxed it out and even the set test failed.
      } else {
        cachedStorage = false;
      }
    }
    return cachedStorage;
  }

  // Check to set if the error is us dealing with being out of space
  function isOutOfSpace(e) {
    return e && (
      e.name === 'QUOTA_EXCEEDED_ERR' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.name === 'QuotaExceededError'
    );
  }

  /**
   * Returns a string where all RegExp special characters are escaped with a \.
   * @param {String} text
   * @return {string}
   */
  function escapeRegExpSpecialCharacters(text) {
    return text.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
  }

  /**
   * Returns the full string for the localStorage expiration item.
   * @param {String} key
   * @return {string}
   */
  function expirationKey(key) {
    return key + cacheSuffix;
  }

  /**
   * Returns the number of minutes since the epoch.
   * @return {number}
   */
  function currentTime() {
    return Math.floor((new Date().getTime()) / expiryMilliseconds);
  }

  /**
   * Wrapper functions for localStorage methods
   */

  function getItem(key) {
    return localStorage.getItem(cachePrefix + cacheBucket + key);
  }

  function setItem(key, value) {
    // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
    localStorage.removeItem(cachePrefix + cacheBucket + key);
    localStorage.setItem(cachePrefix + cacheBucket + key, value);
  }

  function removeItem(key) {
    localStorage.removeItem(cachePrefix + cacheBucket + key);
  }

  function eachKey(fn) {
    var prefixRegExp = new RegExp('^' + escapeRegExpSpecialCharacters(cachePrefix) + escapeRegExpSpecialCharacters(cacheBucket) + '(.*)');
    // We first identify which keys to process
    var keysToProcess = [];
    var key, i;
    for (i = 0; i < localStorage.length; i++) {
      key = localStorage.key(i);
      key = key && key.match(prefixRegExp);
      key = key && key[1];
      if (key && key.indexOf(cacheSuffix) < 0) {
        keysToProcess.push(key);
      }
    }
    // Then we apply the processing function to each key
    for (i = 0; i < keysToProcess.length; i++) {
      fn(keysToProcess[i], expirationKey(keysToProcess[i]));
    }
  }

  function flushItem(key) {
    var exprKey = expirationKey(key);
    removeItem(key);
    removeItem(exprKey);
  }

  function flushExpiredItem(key) {
    var exprKey = expirationKey(key);
    var expr = getItem(exprKey);

    if (expr) {
      var expirationTime = parseInt(expr, expiryRadix);

      // Check if we should actually kick item out of storage
      if (currentTime() >= expirationTime) {
        removeItem(key);
        removeItem(exprKey);
        return true;
      }
    }
  }

  function warn(message, err) {
    if (!warnings) return;
    if (!('console' in window) || typeof window.console.warn !== 'function') return;
    window.console.warn("LSC - " + message);
    if (err) window.console.warn("LSC - error: " + err.message);
  }

  function calculateMaxDate(expiryMilliseconds) {
    return Math.floor(8.64e15 / expiryMilliseconds);
  }

  var lsc = {
    /**
     * Stores the value in localStorage. Expires after specified number of minutes.
     * @param {string} key
     * @param {string} value
     * @param {number} time
     * @return {boolean} whether the value was inserted successfully
     */
    set: function (key, value, time) {
      if (!supportsStorage()) return false;

      try {
        setItem(key, value);
      } catch (e) {
        if (isOutOfSpace(e)) {
          // If we exceeded the quota, then we will sort
          // by the expire time, and then remove the N oldest
          var storedKeys = [];
          var storedKey;
          eachKey(function (key, exprKey) {
            var expiration = getItem(exprKey);
            if (expiration) {
              expiration = parseInt(expiration, expiryRadix);
            } else {
              // TODO: Store date added for non-expiring items for smarter removal
              expiration = maxDate;
            }
            storedKeys.push({
              key: key,
              size: (getItem(key) || '').length,
              expiration: expiration
            });
          });
          // Sorts the keys with oldest expiration time last
          storedKeys.sort(function (a, b) { return (b.expiration - a.expiration); });

          var targetSize = (value || '').length;
          while (storedKeys.length && targetSize > 0) {
            storedKey = storedKeys.pop();
            warn("Cache is full, removing item with key '" + storedKey.key + "'");
            flushItem(storedKey.key);
            targetSize -= storedKey.size;
          }
          try {
            setItem(key, value);
          } catch (e) {
            // value may be larger than total quota
            warn("Could not add item with key '" + key + "', perhaps it's too big?", e);
            return false;
          }
        } else {
          // If it was some other error, just give up.
          warn("Could not add item with key '" + key + "'", e);
          return false;
        }
      }

      // If a time is specified, store expiration info in localStorage
      if (time) {
        try {
          setItem(expirationKey(key), (currentTime() + time).toString(expiryRadix));
        } catch (e) {
          removeItem(expirationKey(key));
          removeItem(key);
          warn("Could not set expiration for item with key '" + key + "'", e);
          return false;
        }
      } else {
        // In case they previously set a time, remove that info from localStorage.
        removeItem(expirationKey(key));
      }
      return true;
    },

    /**
     * Retrieves specified value from localStorage, if not expired.
     * @param {string} key
     * @return {string}
     */
    get: function (key) {
      if (!supportsStorage()) return null;

      // Return the de-serialized item if not expired
      if (flushExpiredItem(key)) { return null; }

      var value = getItem(key);
      return value;
    },

    /**
     * Removes a value from localStorage.
     * Equivalent to 'delete' in memcache, but that's a keyword in JS.
     * @param {string} key
     */
    remove: function (key) {
      if (!supportsStorage()) return;

      flushItem(key);
    },

    /**
     * Returns whether local storage is supported.
     * Currently exposed for testing purposes.
     * @return {boolean}
     */
    supported: function () {
      return supportsStorage();
    },

    /**
     * Flushes all lsc items and expiry markers without affecting rest of localStorage
     */
    flush: function () {
      if (!supportsStorage()) return;

      eachKey(function (key) {
        flushItem(key);
      });
    },

    /**
     * Flushes expired lsc items and expiry markers without affecting rest of localStorage
     */
    flushExpired: function () {
      if (!supportsStorage()) return;

      eachKey(function (key) {
        flushExpiredItem(key);
      });
    },

    setBucket: function (bucket) {
      cacheBucket = bucket;
    },

    resetBucket: function () {
      cacheBucket = '';
    },

    setPrefix: function (prefix) {
      cachePrefix = prefix;
    },

    resetPrefix: function () {
      cachePrefix = defaultPrefix;
    },

    /**
     * @returns {number} The currently set number of milliseconds each time unit represents in
     *   the set() function's "time" argument.
     */
    getExpiryMilliseconds: function () {
      return expiryMilliseconds;
    },

    /**
     * Sets the number of milliseconds each time unit represents in the set() function's
     *   "time" argument.
     * Sample values:
     *  1: each time unit = 1 millisecond
     *  1000: each time unit = 1 second
     *  60000: each time unit = 1 minute (Default value)
     *  360000: each time unit = 1 hour
     * @param {number} milliseconds
     */
    setExpiryMilliseconds: function (milliseconds) {
      expiryMilliseconds = milliseconds;
      maxDate = calculateMaxDate(expiryMilliseconds);
    },

    /**
     * Sets whether to display warnings when an item is removed from the cache or not.
     */
    enableWarnings: function (enabled) {
      warnings = enabled;
    }
  };

  // Return the module
  return lsc;
}));
