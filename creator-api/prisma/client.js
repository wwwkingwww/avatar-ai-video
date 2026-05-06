import { PrismaClient } from '@prisma/client'

let prisma = null
let prismaError = null

if (process.env.DATABASE_URL) {
  try {
    prisma = new PrismaClient()
  } catch (e) {
    prismaError = `Prisma 初始化失败: ${e.message}`
  }
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

// 导出辅助函数，用于检查数据库是否可用
export function isDatabaseAvailable() {
  return !!prisma && !prismaError
}
