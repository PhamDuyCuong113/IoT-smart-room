export function notFound(req, res) {
  return res.status(404).json({
    error: `Không tìm thấy API: ${req.method} ${req.originalUrl}`,
  })
}
