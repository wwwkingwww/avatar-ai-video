import { PrismaClient } from '@prisma/client'

let prisma = null
let prismaError = null

if (process.env.DATABASE_URL) {
  prisma = new PrismaClient()
} else {
  prismaError = 'DATABASE_URL 环境变量未设置，数据库不可用'
}

function notAvailable() {
  throw new Error(prismaError)
}

const noopClient = {
  videoTask: new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return undefined
      return () => notAvailable()
    }
  })
}

export default prisma || noopClient
export { prismaError }
