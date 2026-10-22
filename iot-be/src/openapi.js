const error = {
  description: 'Yêu cầu không hợp lệ hoặc có lỗi máy chủ.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
}

const json = (schema) => ({
  'application/json': { schema },
})

const body = (schema) => ({
  required: true,
  content: json(schema),
})

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
}

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'IoT Smart Room API',
    version: '1.0.0',
    description: 'Tài liệu API cho backend phòng thông minh IoT.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  tags: [
    { name: 'Auth', description: 'Đăng ký và đăng nhập' },
    { name: 'User', description: 'Thông tin hồ sơ' },
    { name: 'Dashboard' },
    { name: 'Sensor' },
    { name: 'Device' },
    { name: 'History' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Dashboard'],
        summary: 'Kiểm tra API và kết nối cơ sở dữ liệu',
        responses: {
          200: {
            description: 'Dịch vụ hoạt động',
            content: json({ type: 'object', properties: { ok: { type: 'boolean' }, database: { type: 'string' } } }),
          },
          500: error,
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Tạo tài khoản',
        requestBody: body({
          type: 'object',
          required: ['username', 'password', 'fullName'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string', minLength: 6 },
            fullName: { type: 'string' },
          },
        }),
        responses: {
          201: { description: 'Tài khoản đã tạo', content: json({ $ref: '#/components/schemas/User' }) },
          400: error,
          409: error,
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng nhập',
        requestBody: body({
          type: 'object',
          required: ['username', 'password'],
          properties: { username: { type: 'string' }, password: { type: 'string' } },
        }),
        responses: {
          200: { description: 'Phiên đăng nhập', content: json({ $ref: '#/components/schemas/LoginSession' }) },
          400: error,
          401: error,
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Lấy người dùng trong phiên đăng nhập hiện tại',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Tài khoản hiện tại', content: json({ $ref: '#/components/schemas/User' }) },
          401: error,
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['User'],
        summary: 'Liệt kê tài khoản (quản trị viên)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách tài khoản', content: json({ type: 'array', items: { $ref: '#/components/schemas/User' } }) }, 403: error },
      },
    },
    '/api/users/{id}/role': {
      parameters: [idParam],
      patch: {
        tags: ['User'],
        summary: 'Thay đổi vai trò tài khoản (quản trị viên)',
        security: [{ bearerAuth: [] }],
        requestBody: body({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'operator', 'viewer'] } } }),
        responses: { 200: { description: 'Vai trò đã cập nhật', content: json({ $ref: '#/components/schemas/User' }) }, 400: error, 403: error, 404: error },
      },
    },
    '/api/profile/{id}': {
      parameters: [idParam],
      get: {
        tags: ['User'],
        summary: 'Lấy hồ sơ người dùng',
        responses: {
          200: { description: 'Hồ sơ người dùng', content: json({ $ref: '#/components/schemas/Profile' }) },
          404: error,
        },
      },
      put: {
        tags: ['User'],
        summary: 'Cập nhật hồ sơ người dùng',
        requestBody: body({ $ref: '#/components/schemas/ProfileUpdate' }),
        responses: {
          200: { description: 'Hồ sơ đã cập nhật', content: json({ $ref: '#/components/schemas/Profile' }) },
          404: error,
        },
      },
    },
    '/api/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Lấy dữ liệu tổng quan',
        responses: {
          200: { description: 'Dữ liệu dashboard', content: json({ $ref: '#/components/schemas/Dashboard' }) },
        },
      },
    },
    '/api/sensor-data': {
      get: {
        tags: ['Sensor'],
        summary: 'Lấy danh sách dữ liệu cảm biến',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'by', in: 'query', description: 'Tìm tất cả, theo thời gian hoặc theo giá trị của từng cảm biến. Để trống q để lấy tất cả bản ghi của cảm biến đã chọn.', schema: { type: 'string', enum: ['all', 'time', 'light', 'humidity', 'temperature'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'oldest'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: { description: 'Danh sách phân trang', content: json({ $ref: '#/components/schemas/PagedSensorData' }) },
        },
      },
      post: {
        tags: ['Sensor'],
        summary: 'Thêm một bản ghi cảm biến',
        requestBody: body({
          type: 'object',
          required: ['sensor_id', 'value'],
          properties: {
            sensor_id: { type: 'integer', minimum: 1 },
            value: { type: 'number' },
            recorded_at: { type: 'string', format: 'date-time', nullable: true },
          },
        }),
        responses: {
          201: { description: 'Bản ghi đã tạo', content: json({ $ref: '#/components/schemas/SensorRecord' }) },
          400: error,
        },
      },
    },
    '/api/devices/{id}/status': {
      parameters: [idParam],
      patch: {
        tags: ['Device'],
        summary: 'Bật hoặc tắt một thiết bị',
        security: [{ bearerAuth: [] }],
        requestBody: body({
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['ON', 'OFF'] } },
        }),
        responses: {
          200: { description: 'Trạng thái thiết bị đã cập nhật', content: json({ $ref: '#/components/schemas/Device' }) },
          400: error,
          404: error,
        },
      },
    },
    '/api/activity-history': {
      get: {
        tags: ['History'],
        summary: 'Lấy lịch sử hoạt động',
        parameters: [
          { name: 'device', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['LOADING', 'THÀNH CÔNG', 'THẤT BẠI'] } },
          { name: 'user', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', description: 'DD/MM/YYYY HH:mm:ss', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'oldest'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: { description: 'Lịch sử phân trang', content: json({ $ref: '#/components/schemas/PagedActivity' }) },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'signed token' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
      LoginSession: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          fullName: { type: 'string' },
          role: { type: 'string' },
        },
      },
      Profile: {
        allOf: [
          { $ref: '#/components/schemas/User' },
          {
            type: 'object',
            properties: {
              student_id: { type: 'string', nullable: true },
              class: { type: 'string', nullable: true },
              email: { type: 'string', nullable: true },
              phone: { type: 'string', nullable: true },
              github: { type: 'string', nullable: true },
              figma: { type: 'string', nullable: true },
              report: { type: 'string', nullable: true },
              postman: { type: 'string', nullable: true },
            },
          },
        ],
      },
      ProfileUpdate: {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          student_id: { type: 'string' },
          class: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          github: { type: 'string' },
          figma: { type: 'string' },
          report: { type: 'string' },
          postman: { type: 'string' },
        },
      },
      Device: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['ON', 'OFF'] },
        },
      },
      SensorRecord: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          value: { type: 'number' },
          unit: { type: 'string' },
          sensor: { type: 'string' },
          recorded_at: { type: 'string', format: 'date-time' },
        },
      },
      PagedSensorData: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, value: { type: 'string' }, time: { type: 'string' }, device: { type: 'string' } } } },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      Dashboard: {
        type: 'object',
        properties: {
          sensors: { type: 'array', items: { type: 'object', additionalProperties: true } },
          series: { type: 'array', items: { type: 'object', additionalProperties: true } },
          devices: { type: 'array', items: { $ref: '#/components/schemas/Device' } },
        },
      },
      Activity: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          device: { type: 'string' },
          action: { type: 'string' },
          status: { type: 'string', enum: ['LOADING', 'THÀNH CÔNG', 'THẤT BẠI'], description: 'LOADING trong lúc chờ ESP32 phản hồi; cập nhật kết quả trên cùng bản ghi.' },
          user: { type: 'string' },
          time: { type: 'string', format: 'date-time' },
        },
      },
      PagedActivity: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Activity' } },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
    },
  },
}

export default openapi
