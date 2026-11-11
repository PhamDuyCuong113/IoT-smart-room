import cors from 'cors'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env.js'
import openapi from './docs/openapi.js'
import { errorHandler } from './middlewares/error-handler.js'
import { notFound } from './middlewares/not-found.js'
import { registerActivityHistoryRoutes } from './modules/activity-history.js'
import { registerAuthRoutes } from './modules/auth.js'
import { registerDashboardRoutes } from './modules/dashboard.js'
import { registerDeviceRoutes } from './modules/devices.js'
import { registerSensorRoutes } from './modules/sensors.js'
import { registerSystemRoutes } from './modules/system.js'
import { registerUserRoutes } from './modules/users.js'
import { registerVirtualAlertRoutes } from './modules/virtual-alerts.js'

const app = express()

app.use(cors({ origin: env.clientUrl }))
app.use(express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi))
registerSystemRoutes(app)
registerAuthRoutes(app)
registerUserRoutes(app)
registerDashboardRoutes(app)
registerSensorRoutes(app)
registerDeviceRoutes(app)
registerActivityHistoryRoutes(app)
registerVirtualAlertRoutes(app)
app.use(notFound)
app.use(errorHandler)

export default app
