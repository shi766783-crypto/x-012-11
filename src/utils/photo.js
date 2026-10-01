// 照片在档案中有两种形态：
// - 旧数据：直接保存的 dataURL 字符串（未压缩原图）
// - 新数据：{ src, width, height, bytes, compressed } 对象
// 统一通过下面的 helper 读取，避免历史数据因格式升级无法显示。

const encoder = new TextEncoder()

export function dataUrlBytes(dataUrl) {
  if (!dataUrl) return 0
  return encoder.encode(dataUrl).length
}

export function getPhotoSrc(photo) {
  if (!photo) return ''
  return typeof photo === 'string' ? photo : photo.src || ''
}

export function getPhotoSize(photo) {
  if (!photo) return 0
  if (typeof photo === 'string') return dataUrlBytes(photo)
  return Number(photo.bytes) || dataUrlBytes(photo.src)
}

export function isLegacyPhoto(photo) {
  return typeof photo === 'string' && photo.length > 0
}
