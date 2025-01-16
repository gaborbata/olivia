let ARC;
ARC = ARC || (function () {

  // common
  const ARCHIVE_MEMBER_FLAG = 0x1A;
  const METHOD_ARC_STORE = 0x02; // Method ID 2 (store)
  const END_OF_FILE_MARKER = 0x00;
  const HEADER_SIZE = 29;
  const END_OF_FILE = [ARCHIVE_MEMBER_FLAG, END_OF_FILE_MARKER];

  /**
   * Calculates the CRC-16/ARC checksum for an array of bytes.
   *
   * @param {Uint8Array} data - The input data as an array of bytes.
   * @returns {number} The 16-bit CRC-16/ARC checksum (0x0000 to 0xFFFF).
   */
  function crc16(data) {
    const POLYNOMIAL = 0xA001;
    let crc = 0x0000;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >>> 1) ^ POLYNOMIAL;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    return crc & 0xFFFF;
  }

  function crc16modbus(buffer) {
    let crc = 0xFFFF;
    let odd;
    for (let i = 0; i < buffer.length; i++) {
      crc = crc ^ buffer[i];
      for (let j = 0; j < 8; j++) {
        odd = crc & 0x0001;
        crc = crc >> 1;
        if (odd) {
          crc = crc ^ 0xA001;
        }
      }
    }
    return crc;
  }

  // creates

  /**
   * Creates the MS-DOS Date and Time fields.
   */
  function createDateTime(dateObj) {
    const year = dateObj.getFullYear() - 1980;
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const hour = dateObj.getHours();
    const minute = dateObj.getMinutes();
    const secondIntervals = Math.floor(dateObj.getSeconds() / 2);
    const dateField = (year << 9) | (month << 5) | day;
    const timeField = (hour << 11) | (minute << 5) | secondIntervals;
    return { dateField, timeField };
  }

  function createFileName(filename) {
    const padded = new Uint8Array(13).fill(0x00);
    const name = filename.toUpperCase();
    let i = 0;
    for (const char of name) {
      padded[i++] = char.charCodeAt(0);
      if (i >= 11) {
        break;
      }
    }
    return padded;
  }

  /**
   * Creates a fixed 29-byte ARC member header using Method 2 (New-Style Store)
   *
   * @param {Uint8Array} uncompressedBytes The uncompressed data.
   * @param {string} filename The name of the file (e.g., "DATA.BIN").
   * @param {Date} dateObj The date object for the file timestamp.
   * @returns {Uint8Array} The 29-byte ARC header ArrayBuffer.
   */
  function createArcHeader(uncompressedBytes, filename, dateObj) {
    const originalSize = uncompressedBytes.length;
    const compressedSize = originalSize;
    const checksum = crc16(uncompressedBytes);
    const filenameBytes = createFileName(filename);
    const { dateField, timeField } = createDateTime(dateObj);

    const headerBuffer = new ArrayBuffer(HEADER_SIZE);
    const view = new DataView(headerBuffer);

    let offset = 0;
    const littleEndian = true;

    view.setUint8(offset, ARCHIVE_MEMBER_FLAG);
    offset += 1;

    view.setUint8(offset, METHOD_ARC_STORE);
    offset += 1;

    new Uint8Array(headerBuffer).set(filenameBytes, offset);
    offset += 13;

    view.setUint32(offset, compressedSize, littleEndian);
    offset += 4;

    view.setUint16(offset, dateField, littleEndian);
    offset += 2;

    view.setUint16(offset, timeField, littleEndian);
    offset += 2;

    view.setUint16(offset, checksum, littleEndian);
    offset += 2;

    view.setUint32(offset, originalSize, littleEndian);

    return new Uint8Array(headerBuffer);
  }

  // parse

  /**
   * Parses a 29-byte ARC member header (Method 2 - New-Style Store)
   *
   * @param {Uint8Array|Buffer|ArrayBuffer} headerBytes The 29-byte ARC header.
   * @returns {Object} Parsed header data with validation.
   * @throws {Error} If header is invalid or malformed.
   */
  function parseArcHeader(headerBytes) {
    let uint8Array;
    if (headerBytes instanceof Uint8Array) {
      uint8Array = headerBytes;
    } else if (headerBytes instanceof ArrayBuffer) {
      uint8Array = new Uint8Array(headerBytes);
    } else if (Buffer && headerBytes instanceof Buffer) {
      uint8Array = new Uint8Array(headerBytes.buffer, headerBytes.byteOffset, headerBytes.length);
    } else {
      throw new Error('headerBytes must be Uint8Array, Buffer, or ArrayBuffer');
    }

    if (uint8Array.length !== HEADER_SIZE) {
      throw new Error(`Invalid header size: expected ${HEADER_SIZE} bytes, got ${uint8Array.length}`);
    }

    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, HEADER_SIZE);
    const littleEndian = true;

    let offset = 0;

    // 1. Archive Member Flag (1 byte)
    const archiveMemberFlag = dataView.getUint8(offset);
    offset += 1;

    // Validate the flag
    if (archiveMemberFlag !== 0x1A) {
      throw new Error(`Invalid ARC header flag: expected 0x1A, got 0x${archiveMemberFlag.toString(16).padStart(2, '0')}`);
    }

    // 2. Method ID (1 byte)
    const methodId = dataView.getUint8(offset);
    offset += 1;

    // Validate the flag
    if (methodId !== 0x02) {
      throw new Error(`Only store method is supported (0x02)`);
    }

    // 3. Filename (13 bytes, null-terminated, space-padded)
    const filenameBytes = uint8Array.subarray(offset, offset + 13);
    offset += 13;

    // Extract filename
    const filename = String.fromCharCode(...filenameBytes).replace(/\x00/g, '').trim();

    // 4. Compressed Size (4 bytes, little endian)
    const compressedSize = dataView.getUint32(offset, littleEndian);
    offset += 4;

    // 5. Date Field (2 bytes, little endian, MS-DOS format)
    const dateField = dataView.getUint16(offset, littleEndian);
    offset += 2;

    // 6. Time Field (2 bytes, little endian, MS-DOS format)
    const timeField = dataView.getUint16(offset, littleEndian);
    offset += 2;

    // 7. CRC-16 Checksum (2 bytes, little endian)
    const storedChecksum = dataView.getUint16(offset, littleEndian);
    offset += 2;

    // 8. Original Size (4 bytes, little endian)
    const originalSize = dataView.getUint32(offset, littleEndian);

    // Parse MS-DOS date/time
    const fileDate = parseMsDosDateTime(dateField, timeField);

    // Validate consistency
    if (methodId === 0x02 && compressedSize !== originalSize) {
      throw new Error(`Invalid store header: compressedSize (${compressedSize}) must equal originalSize (${originalSize}) for method 2`);
    }

    return {
      archiveMemberFlag: `0x${archiveMemberFlag.toString(16).padStart(2, '0')}`,
      method: `0x${methodId.toString(16).padStart(2, '0')}`,
      filename: filename,
      compressed: compressedSize,
      original: originalSize,
      timestamp: fileDate.isoString,
      checksum: `0x${storedChecksum.toString(16).padStart(4, '0')}`,
    };
  }

  /**
   * Parses MS-DOS date/time format
   *
   * MS-DOS Date Format (16 bits):
   *   Bits 0-4: Day (1-31)
   *   Bits 5-8: Month (1-12)
   *   Bits 9-15: Year (from 1980, 0-127 representing 1980-2107)
   *
   * MS-DOS Time Format (16 bits):
   *   Bits 0-4: Second/2 (0-29 representing 0-58 seconds, even seconds only)
   *   Bits 5-10: Minute (0-59)
   *   Bits 11-15: Hour (0-23)
   *
   * @param {number} dateField - 16-bit MS-DOS date
   * @param {number} timeField - 16-bit MS-DOS time
   * @returns {Object} Parsed date/time
   */
  function parseMsDosDateTime(dateField, timeField) {
    const day = dateField & 0x1F;
    const month = (dateField >> 5) & 0x0F;
    const year = 1980 + ((dateField >> 9) & 0x7F);

    const seconds = (timeField & 0x1F) * 2;
    const minutes = (timeField >> 5) & 0x3F;
    const hours = (timeField >> 11) & 0x1F;

    const dateObj = new Date(year, month - 1, day, hours, minutes, seconds);

    return {
      date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      isoString: dateObj.toISOString(),
      dateObj: dateObj,
    };
  }

  /**
   * Reads an ARC file and parses all headers
   *
   * @param {Uint8Array|Buffer} arcFile - Complete ARC file data
   * @param {number} offset - byte offset
   * @returns {Array} Array of parsed file entries
   */
  function parseArcFile(arcFile, offset = 0) {
    const headerBytes = arcFile.slice(offset, offset + HEADER_SIZE);
    const header = parseArcHeader(headerBytes);
    const dataOffset = offset + HEADER_SIZE;
    const dataSize = header.compressed;
    const fileData = arcFile.slice(dataOffset, dataOffset + dataSize);

    const validateChecksum = function (data, stored) {
      const calculatedChecksum = crc16(data, stored);
      const hex = `0x${calculatedChecksum.toString(16).padStart(4, '0')}`
      return {
        valid: hex == stored,
        stored: stored,
        calculated: hex,
      }
    };

    return {
      header: header,
      checksum: validateChecksum(fileData, header.checksum),
      sizeMatches: fileData.length === dataSize && arcFile.length === (HEADER_SIZE + fileData.length + END_OF_FILE.length),
    };
  }

  // examples
  function createArcFileBase64(uncompressedBytes, filename, dateObj) {
    const headerBytes = createArcHeader(uncompressedBytes, filename, dateObj);
    const arcFileBytes = new Uint8Array(Array.from(headerBytes).concat(Array.from(uncompressedBytes)).concat(Array.from(END_OF_FILE)));
    console.log(parseArcFile(arcFileBytes));
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(arcFileBytes).toString('base64');
    } else if (typeof window !== 'undefined' && window.btoa) {
      const binaryString = arcFileBytes.reduce((data, byte) => data + String.fromCharCode(byte), '');
      return window.btoa(binaryString);
    } else {
      throw new Error("Base64 encoding environment not supported.");
    }
  }

  function example() {
    const textEncoder = new TextEncoder();
    const dataString = "Hello World!";
    const uncompressedBytes = textEncoder.encode(dataString);
    const filename = "example.txt";
    const fileDate = new Date('2025-01-01T00:00:00Z');
    const base64ArcFile = createArcFileBase64(uncompressedBytes, filename, fileDate);
    console.log(base64ArcFile);
  }

  // exports
  const exp = {
    version: 'ARC 5.21q',
    headerSize: HEADER_SIZE,
    endOfFile: END_OF_FILE,
    createArcHeader: createArcHeader,
    parseArcHeader: parseArcHeader,
    parseArcFile: parseArcFile,
    createArcFileBase64: createArcFileBase64,
    example: example,
  };

  if (typeof exports === "object") {
    module.exports = exp;
  } else {
    return exp;
  }
})();
