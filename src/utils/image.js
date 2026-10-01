// 照片落库前统一缩放 + 压缩，控制单张体积，避免大图很快撑爆 localStorage。
// 输出统一为 JPEG dataURL（本地预览与 img 标签都能直接使用）；
// 若原图本身已经很小则原样返回，避免越压越大。
import { dataUrlBytes } from './photo'

const MAX_EDGE = 1280
const TARGET_BYTES = 320 * 1024
// 质量阶梯：逐档降低，直到体积进入目标范围
const QUALITY_STEPS = [0.88, 0.8, 0.72, 0.62, 0.5, 0.4]
const MIN_QUALITY = 0.3
const JPEG_TYPE = 'image/jpeg'

export class ImageCompressError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImageCompressError'
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new ImageCompressError('照片读取失败，请换一张试试。'))
    reader.readAsDataURL(file)
  })
}

// 优先用 createImageBitmap（可顺带处理 EXIF 方向），失败再退回 <img>
async function decodeImage(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(blob, { imageOrientation: 'from-image' })
      } catch {
        return await createImageBitmap(blob)
      }
    }
  } catch {
    // fetch/ImageBitmap 不可用时走 Image 分支
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ImageCompressError('照片解析失败，文件可能已损坏。'))
    img.src = dataUrl
  })
}

function release(source) {
  if (source && typeof source.close === 'function') source.close()
}

function drawToCanvas(source, scale = 1) {
  const width = Math.max(1, Math.round((source.width || source.naturalWidth) * scale))
  const height = Math.max(1, Math.round((source.height || source.naturalHeight) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // JPEG 不支持透明通道，先铺白底，避免透明区域变成黑色
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return { canvas, width, height }
}

function encode(canvas, quality) {
  const src = canvas.toDataURL(JPEG_TYPE, quality)
  return { src, width: canvas.width, height: canvas.height, bytes: dataUrlBytes(src) }
}

// 缩放后按质量阶梯逐档编码：首档达标即返回，否则返回体积最小的一档
function encodeShrinking(source) {
  const naturalWidth = source.width || source.naturalWidth || 0
  const naturalHeight = source.height || source.naturalHeight || 0
  const longEdge = Math.max(naturalWidth, naturalHeight)
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1

  const { canvas } = drawToCanvas(source, scale)
  let smallest = null
  for (const quality of QUALITY_STEPS) {
    const candidate = encode(canvas, quality)
    if (!smallest || candidate.bytes < smallest.bytes) smallest = candidate
    if (candidate.bytes <= TARGET_BYTES) return candidate
  }
  // 阶梯最低档仍超标，再压一档兜底
  const lastTry = encode(canvas, MIN_QUALITY)
  return lastTry.bytes < smallest.bytes ? lastTry : smallest
}

export async function compressImageFile(file) {
  if (!file) throw new ImageCompressError('未选择照片文件。')
  if (!/^image\//.test(file.type)) {
    throw new ImageCompressError('只支持图片格式的照片。')
  }

  const originalDataUrl = await fileToDataUrl(file)
  const originalBytes = dataUrlBytes(originalDataUrl)

  let source
  try {
    source = await decodeImage(originalDataUrl)
  } catch (error) {
    if (error instanceof ImageCompressError) throw error
    throw new ImageCompressError('照片解析失败，文件可能已损坏。')
  }

  try {
    const naturalWidth = source.width || source.naturalWidth || 0
    const naturalHeight = source.height || source.naturalHeight || 0
    const needsScale = Math.max(naturalWidth, naturalHeight) > MAX_EDGE
    const result = encodeShrinking(source)

    // 原图已经够小且无需缩放：保留原图，避免格式转换反而增大体积
    if (!needsScale && originalBytes <= TARGET_BYTES && originalBytes <= result.bytes) {
      return {
        src: originalDataUrl,
        width: naturalWidth,
        height: naturalHeight,
        bytes: originalBytes,
        compressed: false,
      }
    }
    return { ...result, compressed: true }
  } finally {
    release(source)
  }
}

// 对历史遗留的未压缩 dataURL 重新压缩；调用方应在返回体积更小时替换
export async function compressDataUrl(dataUrl) {
  const source = await decodeImage(dataUrl)
  try {
    return encodeShrinking(source)
  } finally {
    release(source)
  }
}
