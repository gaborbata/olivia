# Webapp to display encrypted images

This application is a proof of concept for client-side, on-the-fly decryption of images.
It leverages the AES-256 encryption algorithm to ensure that images are stored and transmitted in an encrypted state,
with decryption occurring only on the client device using a pre-shared key.
This approach prioritizes data privacy and security.

Encryption/decryption is done with the `crypto-js` JavaScript library.

## Encryption process

* Put unencrypted files into `source` folder.

  Source files are required to adhere to a specific naming convention: `YYYYMMDD_XX_T.ext`,
  where `YYYYMMDD` represents the date, `XX` is an index, and `T` denotes the file type
  (`p` for WebP images, `x` for JPEG-XL images, or `m` for WebM videos).
  The file extension must also correspond to the specified type, e.g. `20250130_01_p.webp`.

  Currently, only `webp`, `jxl` and `webm` file formats are supported.
  JPEG-XL decoding support is implemented via a modified version of jxl.js, using WebAssembly (WASM).

  Make sure to exclude this folder from public access.

* Update `source/images.json` with the newly added image content e.g.:

  ```js
  [
    {
      "id": "20250101_01_p.webp",
      "title": "Another Sample Title",
      "description": "Another Sample Description",
      "date": "2025-01-01"
    },
    {
      "id": "20250102_01_p.webp",
      "title": "Sample Title",
      "description": "Sample Description",
      "date": "2025-01-02"
    }
  ]
  ```

  Images will be ordered by date, type (i.e. webp or webm) and id, ascending.

* Execute `crypt.js` with Node.js using the following parameters:

  ```bash
  node crypt.js enc password
  ```

  where `password` is the mutually agreed password.

  Enrypted content will go into the `asset/content` folder with the `.arc` extension,
  e.g. `asset/content/2025/20250130_01_p.arc`, `asset/content/images.arc` etc.

  `asset` folder must be public.

  Created `.arc` files are compatible with the leacy ARC 5.20 file archive utility.
  It has been chosen due to its compact header size, including file integrity information.
  File integrity check can be performed with external utilities like: `arc`, `lsar`, `nomarch` etc.

## Storage configuration

Image files can be served from different sources,
which is drivern by the application configuration stored in the `app.json` file.
The encryted `app.arc` file must be served from the server of the web application.

* Serve files from the server of the web application, from `assets/content` folder.

  ```js
  {
    "storage": "asset/content"
  }
  ```

* Serve files from an object storage service (e.g. S3, Cloudflare R2):

  ```js
  {
    "storage": "https://assets.service.com"
  }
  ```

## Example folder structure

```
 |-- asset
 |   |-- css
 |   |-- font
 |   |-- content
 |   |   |-- app.arc
 |   |   |-- images.arc
 |   |   `-- 2025
 |   |       |-- 20250101_01_p.arc
 |   |       `-- 20250102_01_p.arc
 |   |-- image
 |   `-- js
 |-- source
 |   |-- app.json
 |   |-- images.json
 |   |-- 20250101_01_p.webp
 |   `-- 20250102_01_p.webp
 |-- index.html
 `-- crypt.js
```
