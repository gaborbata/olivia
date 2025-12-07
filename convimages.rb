require 'json'

# Convert images from source/original folder to source folder, resizing with 3:2 aspect ratio,
# respecting naming conventions

# quality 82 is good enough for webp, and 80 for jxl
DEFAULT_IMAGE_QUALITY = 80
DEFAULT_IMAGE_FORMAT = 'jxl'
IMAGE_MULTIPLIER = 600
IMAGE_SIZE_X = IMAGE_MULTIPLIER * 3
IMAGE_SIZE_Y = IMAGE_MULTIPLIER * 2
QUESTION_MARK = 'QQQ'
TEXT_SEPARATOR = '-----'

json = JSON.parse(File.read('./source/images.json')).sort_by { |entry| entry["id"] }

def parse(image, fname, ext)
  result = {}
  name = fname.match(/[_-](20\d{2}-?\d{2}-?\d{2})[T_-]/)[1].gsub('-', '')
  date = name.strip.insert(4, '-').insert(7, '-')
  details = (ext == '.webm' ? 'video.webm WEBM 0x0+0+0' : `gm identify "#{image}"`).sub(/.+?#{ext}/, ext).split(' ')
  resolution = details[2].split(/[+x]/)
  result[:name] = name
  result[:date] = date
  result[:width] = resolution[0].to_i
  result[:height] = resolution[1].to_i
  result[:landscape] = result[:width] > result[:height]
  result[:title] = fname.gsub('# ', '#').gsub(QUESTION_MARK, '?').split(TEXT_SEPARATOR)[1]
  result[:desc] = fname.gsub(QUESTION_MARK, '?').split(TEXT_SEPARATOR)[2]
  return result
end

# convert images to webp
quality = ARGV[0].to_i
quality = DEFAULT_IMAGE_QUALITY if quality == 0
format = ARGV[1].nil? ? DEFAULT_IMAGE_FORMAT : ARGV[1]
puts "*** quality: #{quality}, format: #{format}"
convert_webp_command = 'gm convert -quality %d -define webp:method=6 -define webp:auto-filter=true -define webp:image-hint=picture -define webp:use-sharp-yuv=true -resize "%s" -gravity Center -crop %s %s "%s" "%s"'
convert_jxl_command = 'gm convert -quality %d -define jxl:effort=9 -resize "%s" -gravity Center -crop %s %s "%s" "%s"'
identify_command = 'gm identify "%s"'
converter = `gm version`.include?('GraphicsMagick')

Dir.glob('./source/original/*.{png,jpg,jpeg,webp,webm,jxl,JPG,JPEG}').sort.each do |image|
  name = File.basename(image, '.*')
  ext = File.extname(image)
  details = parse(image, name, ext)
  puts '*** ' + name + ': ' + details.to_s

  video = ext == '.webm'
  flag = 'p' if format == 'webp' && ext != '.jxl'
  flag = 'x' if format == 'jxl' && ext != '.webp'
  flag = 'p' if ext == '.webp'
  flag = 'x' if ext == '.jxl'
  flag = 'm' if ext == '.webm'

  index = 1
  id = nil
  while id.nil? do
    candidate = details[:name] + '_' + index.to_s.rjust(2, '0') + '_' + flag
    if json.find { |entry| entry["id"].start_with?("#{candidate}.") }.nil?
      id = candidate
    end
    index = index + 1
  end

  # rename image/video
  moved_img = './source/' + id + ext
  if ['.webm', '.webp', '.jxl'].include?(ext) && !File.exist?(moved_img)
    next if ARGV[0] == 'clean'
    result = system("cp \"#{image}\" \"#{moved_img}\"")
    if json.find { |entry| entry["id"].start_with?("#{id}.") }.nil? && result
      json.push({
        "id" => "#{id}#{ext}",
        "title" => "#{details[:title] ? details[:title] : id.sub(/_[pmx]/, '').sub('_', ' #')}",
        "description" => "#{details[:desc] ? details[:desc] : ''}",
        "date" => "#{details[:date]}"
      })
    end
  end

  # convert to format
  conv_img = './source/' + id + '.' + format
  if !['.webm', '.webp', '.jxl'].include?(ext) && converter && !File.exist?(conv_img)
    system("gm mogrify -strip \"#{image}\"")
    next if ARGV[0] == 'clean'
    rot = ""
    rot = "-rotate 90" if name.include?("rot90")
    rot = "-rotate 180" if name.include?("rot180")
    rot = "-rotate 270" if name.include?("rot270")
    resize = !details[:landscape] ? "#{IMAGE_SIZE_Y}x#{IMAGE_SIZE_X}^" : "#{IMAGE_SIZE_X}x#{IMAGE_SIZE_Y}^"
    crop = !details[:landscape] ? "#{IMAGE_SIZE_Y}x#{IMAGE_SIZE_X}+0+0" : "#{IMAGE_SIZE_X}x#{IMAGE_SIZE_Y}+0+0"

    convert_command = convert_webp_command if format == 'webp'
    convert_command = convert_jxl_command if format == 'jxl'

    result = system("#{sprintf(convert_command, quality, resize, crop, rot, image, conv_img)}")

    system("#{sprintf(identify_command, conv_img)}") if result
    if json.find { |entry| entry["id"].start_with?("#{id}.") }.nil? && result
      json.push({
        "id" => "#{id}.#{format}",
        "title" => "#{details[:title] ? details[:title] : id.sub(/_[pmx]/, '').sub('_', ' #')}",
        "description" => "#{details[:desc] ? details[:desc] : ''}",
        "date" => "#{details[:date]}"
      })
    end
  end
end

File.open('./source/images.json', 'w') do |file|
  file.write(JSON.pretty_generate(json.sort_by { |entry| entry["id"] }.reverse))
end
