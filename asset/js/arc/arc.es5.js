var ARC = ARC || (function () {
  var ARCHIVE_MEMBER_FLAG = 0x1A;
  var METHOD_ARC_STORE = 0x02;
  var END_OF_FILE_MARKER = 0x00;
  var HEADER_SIZE = 29;
  var END_OF_FILE = [ARCHIVE_MEMBER_FLAG, END_OF_FILE_MARKER];

  function crc16(data) {
    var crc = 0x0000;
    for (var i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (var j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >>> 1) ^ 0xA001;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    crc = crc & 0xFFFF;
    return crc;
  }

  function createArcHeader(data, filename, dateObj) {
    var filename = filename || 'FILE.BIN';
    var dateObj = dateObj || new Date();
    // create size fields
    var originalSize = data.length;
    var compressedSize = originalSize;
    // calculate date/time fields
    var year = dateObj.getFullYear() - 1980;
    var month = dateObj.getMonth() + 1;
    var day = dateObj.getDate();
    var hour = dateObj.getHours();
    var minute = dateObj.getMinutes();
    var secondIntervals = Math.floor(dateObj.getSeconds() / 2);
    var dateField = (year << 9) | (month << 5) | day;
    var timeField = (hour << 11) | (minute << 5) | secondIntervals;
    // calculate crc
    var crc = crc16(data);
    // create filename
    var filenameBytes = new Uint8Array(13);
    for (var i = 0; i < Math.min(filename.length, 13); i++) {
      filenameBytes[i] = filename.charCodeAt(i) & 0xFF;
    }
    // create header
    var header = new Uint8Array(HEADER_SIZE);
    var offset = 0;
    header[offset++] = ARCHIVE_MEMBER_FLAG;
    header[offset++] = METHOD_ARC_STORE;
    for (var i = 0; i < 13; i++) {
      header[offset++] = filenameBytes[i];
    }
    header[offset++] = compressedSize & 0xFF;
    header[offset++] = (compressedSize >> 8) & 0xFF;
    header[offset++] = (compressedSize >> 16) & 0xFF;
    header[offset++] = (compressedSize >> 24) & 0xFF;
    header[offset++] = dateField & 0xFF;
    header[offset++] = (dateField >> 8) & 0xFF;
    header[offset++] = timeField & 0xFF;
    header[offset++] = (timeField >> 8) & 0xFF;
    header[offset++] = crc & 0xFF;
    header[offset++] = (crc >> 8) & 0xFF;
    header[offset++] = originalSize & 0xFF;
    header[offset++] = (originalSize >> 8) & 0xFF;
    header[offset++] = (originalSize >> 16) & 0xFF;
    header[offset++] = (originalSize >> 24) & 0xFF;
    return header;
  }

  function parseArcHeader(arcFileBytes) {
    var offset = 0;
    var memberFlag = arcFileBytes[offset++];
    var method = arcFileBytes[offset++];
    // parse file name
    var filename = '';
    for (var i = 0; i < 13; i++) {
      var charCode = arcFileBytes[offset++];
      if (charCode == 0) break;
      filename += String.fromCharCode(charCode);
    }
    var filenameBytesRead = filename.length + 1;
    offset += (13 - filenameBytesRead);
    // parse compressed size
    var compressedSize = (arcFileBytes[offset] & 0xFF) |
      ((arcFileBytes[offset + 1] & 0xFF) << 8) |
      ((arcFileBytes[offset + 2] & 0xFF) << 16) |
      ((arcFileBytes[offset + 3] & 0xFF) << 24);
    offset += 4;
    // parse date field
    var dateField = (arcFileBytes[offset] & 0xFF) |
      ((arcFileBytes[offset + 1] & 0xFF) << 8);
    offset += 2;
    var day = dateField & 0x1F;
    var month = (dateField >> 5) & 0x0F;
    var year = 1980 + ((dateField >> 9) & 0x7F);
    // parse time field
    var timeField = (arcFileBytes[offset] & 0xFF) |
      ((arcFileBytes[offset + 1] & 0xFF) << 8);
    offset += 2;
    var seconds = (timeField & 0x1F) * 2;
    var minutes = (timeField >> 5) & 0x3F;
    var hours = (timeField >> 11) & 0x1F;
    // parse crc
    var checksum = (arcFileBytes[offset] & 0xFF) |
      ((arcFileBytes[offset + 1] & 0xFF) << 8);
    offset += 2;
    // parse original size
    var originalSize = (arcFileBytes[offset] & 0xFF) |
      ((arcFileBytes[offset + 1] & 0xFF) << 8) |
      ((arcFileBytes[offset + 2] & 0xFF) << 16) |
      ((arcFileBytes[offset + 3] & 0xFF) << 24);

    return {
      memberFlag: memberFlag,
      method: method,
      filename: filename,
      compressedSize: compressedSize >>> 0,
      dateField: [year, month, day],
      timeField: [hours, minutes, seconds],
      checksum: checksum,
      originalSize: originalSize >>> 0
    };
  }

  return {
    memberFlag: ARCHIVE_MEMBER_FLAG,
    storeMethod: METHOD_ARC_STORE,
    eofMarker: END_OF_FILE_MARKER,
    headerSize: HEADER_SIZE,
    eofSize: END_OF_FILE.length,
    eof: END_OF_FILE,
    version: 'ARC 5.21',
    createArcHeader: createArcHeader,
    parseArcHeader: parseArcHeader,
    extension: 'arc',
    crc16: crc16
  };
})();
