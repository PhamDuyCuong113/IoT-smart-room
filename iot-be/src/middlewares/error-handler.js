export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if ((error.status || 500) >= 500) console.error(error)
  return res.status(error.status || 500).json({
    error: error.message || 'Lỗi máy chủ.',
  })
}
