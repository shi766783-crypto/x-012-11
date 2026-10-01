// 照片在落库前统一缩放压缩，避免原图 base64 迅速撑爆 localStorage。
// 压缩产物仍是 data URL（image/jpeg），与存量未压缩照片的数据形态一致，
// 旧记录里的 data URL 可继续直接被 <img> 渲染，无需迁移。

const MAX_EDGE = 1280 // 最长边上限，足够卡片/时间线清晰展示
const TARGET_BYTES = 350 * 1024 // 单张照片的目标体积
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']

function loadImageSource(file) {
  // 优先 createImageBitmap：现代浏览器可按 imageOrientation: 'from-image'
  // 自动纠正手机照片的 EXIF 旋转；不支持时退回 <img> + ObjectURL。
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(() => createImageBitmap(file))
      .then((bitmap) => ({ source: bitmap, width: bitmap.width, height: bitmap.height, isBitmap: true }))
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, isBitmap: false, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    img.src = url
  })
}

function releaseImageSource({ source, isBitmap, url }) {
  if (isBitmap) source.close?.()
  else if (url) URL.revokeObjectURL(url)
}

function drawToDataURL(source, width, height, scale, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  // JPEG 不支持透明通道，白底兜底，避免 PNG 透明区域被压成黑色。
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 将图片文件压缩为受限的 JPEG data URL。
 * 先缩放到最长边 MAX_EDGE，再逐级降低质量；质量不够时继续缩小尺寸，
 * 直到体积低于 TARGET_BYTES 或达到保底尺寸/质量。
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, bytes: number }>}
 */
export async function compressImageFile(file) {
  if (!file || !ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('仅支持 JPG、PNG、WebP、GIF 格式的图片')
  }

  const image = await loadImageSource(file)
  try {
    const longest = Math.max(image.width, image.height)
    let scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1
    let quality = 0.85
    let dataUrl = drawToDataURL(image.source, image.width, image.height, scale, quality)
    let bytes = getDataUrlBytes(dataUrl)

    const qualities = [0.85, 0.7, 0.55, 0.4]
    let qi = 0
    while (bytes > TARGET_BYTES && qi < qualities.length - 1) {
      qi += 1
      quality = qualities[qi]
      dataUrl = drawToDataURL(image.source, image.width, image.height, scale, quality)
      bytes = getDataUrlBytes(dataUrl)
    }

    // 质量降到最低仍超标，则继续缩小尺寸兜底。
    while (bytes > TARGET_BYTES && scale > 0.25) {
      scale *= 0.75
      dataUrl = drawToDataURL(image.source, image.width, image.height, scale, quality)
      bytes = getDataUrlBytes(dataUrl)
    }

    return { dataUrl, bytes }
  } finally {
    releaseImageSource(image)
  }
}

/**
 * 将一张已有的 data URL 重新压缩（用于清理存量未压缩旧照片）。
 * @param {string} dataUrl
 * @returns {Promise<{ dataUrl: string, bytes: number }>}
 */
export async function compressDataUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob()
  return compressImageFile(new File([blob], 'legacy-photo.jpg', { type: blob.type || 'image/jpeg' }))
}

/** 估算 data URL 按 UTF-16/ASCII 存储时占用的字节数（base64 解码后的真实体积）。 */
export function getDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0
  const commaIndex = dataUrl.indexOf(',')
  const payload = commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

/** 已压缩照片统一为 JPEG data URL，据此避免对已压缩照片重复处理。 */
export function isCompressedPhoto(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/jpeg')
}
