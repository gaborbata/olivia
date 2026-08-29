const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_IMAGE_QUALITY = 80;
const DEFAULT_IMAGE_FORMAT = 'jxl';
const IMAGE_MULTIPLIER = 600;
const IMAGE_SIZE_X = IMAGE_MULTIPLIER * 3;
const IMAGE_SIZE_Y = IMAGE_MULTIPLIER * 2;
const QUESTION_MARK = 'QQQ';
const TEXT_SEPARATOR = '---';

function run(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString();
  } catch (e) {
    console.error(`${cmd} failed to run due to: ${e}`);
    return null;
  }
}

function parseFileName(imagePath, baseName, ext, useFfmpeg) {
  const result = {};
  const match = baseName.match(/[_-]?(20\d{2}-?\d{2}-?\d{2})[T_-\d]/);
  const name = match ? match[1].replace(/-/g, '') : '00000000';
  const date = `${name.substring(0, 4)}-${name.substring(4, 6)}-${name.substring(6, 8)}`;

  let width = 0;
  let height = 0;

  if (useFfmpeg) {
    const streams = run(`ffprobe -v quiet -print_format json -show_streams "${imagePath}"`) || "{}";
    const json = JSON.parse(streams);
    width = json.streams[0].width || 0;
    height = json.streams[0].height || 0;
  } else {
    let detailsStr;
    if (ext === '.webm') {
      detailsStr = 'video.webm WEBM 0x0+0+0';
    } else {
      detailsStr = run(`gm identify "${imagePath}"`) || "";
    }
    const parts = detailsStr.split(/\s+/);
    const resPart = parts.find(p => /\d+x\d+/.test(p)) || "0x0";
    [width, height] = resPart.split(/[+x]/).map(Number);
  }

  result.name = name;
  result.date = date;
  result.width = width;
  result.height = height;
  result.landscape = width > height;
  result.title = baseName.replace('# ', '#').replace(new RegExp(QUESTION_MARK, 'g'), '?').split(TEXT_SEPARATOR)[1];
  result.desc = baseName.replace(new RegExp(QUESTION_MARK, 'g'), '?').split(TEXT_SEPARATOR)[2];
  return result;
}

function convertImages() {
  const args = process.argv.slice(2);
  const qualityArg = parseInt(args[0]);
  const quality = isNaN(qualityArg) || qualityArg === 0 ? DEFAULT_IMAGE_QUALITY : qualityArg;
  let format = args[1] || DEFAULT_IMAGE_FORMAT;

  let useFfmpeg = false;
  if (format.endsWith('-ffmpeg')) {
    useFfmpeg = true;
    format = format.replace('-ffmpeg', '');
  }

  console.log(`*** quality: ${quality}, format: ${format}, ffmpeg: ${useFfmpeg}`);

  const jsonPath = './source/images.json';
  let json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  json.sort((a, b) => a.id.localeCompare(b.id));

  const isGraphicsMagickInstalled = run('gm version')?.includes('GraphicsMagick');
  if (!isGraphicsMagickInstalled && !useFfmpeg) {
    throw new Error("GraphicsMagick not found");
  }

  const isFfmpegInstalled = run('ffmpeg -version')?.includes(`enable-lib${format}`);
  if (!isFfmpegInstalled && useFfmpeg) {
    throw new Error("ffmpeg not found or image format is not supported");
  }

  const files = fs.readdirSync('./source/original')
    .filter(f => /\.(png|jpg|jpeg|webp|webm|jxl|heic)$/i.test(f))
    .sort();

  const stats = { moved: 0, converted: 0, total: 0, source: files.length };

  for (const fileName of files) {
    const imagePath = path.join('./source/original', fileName);
    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, path.extname(fileName));

    const details = parseFileName(imagePath, baseName, ext, useFfmpeg);

    let typeFlag = '';
    if (ext === '.webm') typeFlag = 'm';
    else if (ext === '.webp' || (format === 'webp' && ext !== '.jxl')) typeFlag = 'p';
    else if (ext === '.jxl' || (format === 'jxl' && ext !== '.webp')) typeFlag = 'x';

    let id = null;
    let index = 1;
    while (!id) {
      const candidate = `${details.name}_${String(index).padStart(2, '0')}_${typeFlag}`;
      if (!json.find(entry => entry.id.startsWith(`${candidate}.`))) {
        id = candidate;
      }
      index++;
    }

    const { name, landscape, width, height, ...detailsShort } = details;
    console.log(`*** ${baseName}: `, id, detailsShort);

    const movedFile = `./source/${id}${ext}`;
    const isAlreadyConvertedExt = ['.webm', '.webp', '.jxl'].includes(ext);

    if (isAlreadyConvertedExt && !fs.existsSync(movedFile)) {
      if (args[0] === 'clean') continue;

      fs.copyFileSync(imagePath, movedFile);
      json.push({
        id: `${id}${ext}`,
        title: details.title || id.replace(/_[pmx]/, '').replace('_', ' #'),
        description: details.desc,
        date: details.date
      });
      stats.moved++;
      stats.total++;
    }

    const convertedFile = `./source/${id}.${format}`;
    if (!isAlreadyConvertedExt && isGraphicsMagickInstalled && !fs.existsSync(convertedFile)) {
      //if (!useFfmpeg) {
      //  run(`gm mogrify -strip "${imagePath}"`);
      //}
      if (args[0] === 'clean') continue;

      let rotateParam = "";
      if (baseName.includes("rot90")) rotateParam = "-rotate 90";
      else if (baseName.includes("rot180")) rotateParam = "-rotate 180";
      else if (baseName.includes("rot270")) rotateParam = "-rotate 270";

      let ffRotateParam = "";
      if (baseName.includes("rot90")) ffRotateParam = ",transpose=1";
      else if (baseName.includes("rot180")) ffRotateParam = ",transpose=2";
      else if (baseName.includes("rot270")) ffRotateParam = ",transpose=3";

      const resizeParam = !details.landscape ? `${IMAGE_SIZE_Y}x${IMAGE_SIZE_X}^` : `${IMAGE_SIZE_X}x${IMAGE_SIZE_Y}^`;
      const cropParam = !details.landscape ? `${IMAGE_SIZE_Y}x${IMAGE_SIZE_X}+0+0` : `${IMAGE_SIZE_X}x${IMAGE_SIZE_Y}+0+0`;

      const ffSizeParam = !details.landscape ? `${IMAGE_SIZE_Y}:${IMAGE_SIZE_X}` : `${IMAGE_SIZE_X}:${IMAGE_SIZE_Y}`;

      const noiseParam = baseName.includes("noise1") ? "+noise Uniform" : "";

      let cmd = "";

      if (useFfmpeg) {
        cmd = `ffmpeg -hide_banner -noautorotate -i "${imagePath}" -vf "scale=${ffSizeParam}:flags=lanczos:force_original_aspect_ratio=increase,crop=${ffSizeParam}${ffRotateParam}" -c:v lib${format} -effort 9 -q:v ${quality} "${convertedFile}"`;
      } else if (format === 'webp') {
        cmd = `gm convert -quality ${quality} -define webp:method=6 -define webp:auto-filter=true -define webp:image-hint=picture -define webp:use-sharp-yuv=true -resize "${resizeParam}" -gravity Center -crop ${cropParam} ${rotateParam} ${noiseParam} "${imagePath}" "${convertedFile}"`;
      } else {
        cmd = `gm convert -flatten -quality ${quality} -define jxl:effort=9 -resize "${resizeParam}" -gravity Center -crop ${cropParam} ${rotateParam} ${noiseParam} "${imagePath}" "${convertedFile}"`;
      }

      const success = run(cmd) !== null;
      if (success) {
        if (useFfmpeg) {
          const details = run(`ffprobe -v quiet -print_format json -show_streams "${convertedFile}"`);
          if (!JSON.parse(details).streams) {
            console.error(`ERROR: ${convertedFile} is invalid`);
          }
        } else {
          run(`gm identify "${convertedFile}"`);
        }
        json.push({
          id: `${id}.${format}`,
          title: details.title || id.replace(/_[pmx]/, '').replace('_', ' #'),
          description: details.desc,
          date: details.date
        });
        stats.converted++;
        stats.total++;
      }
    }
  }

  json.sort((a, b) => b.id.localeCompare(a.id));
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  console.log(`*** done ${JSON.stringify(stats)}`);
}

convertImages();
