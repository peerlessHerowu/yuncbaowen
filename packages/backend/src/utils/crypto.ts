import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const SECRET = (process.env.AES_SECRET_KEY || 'yuncbaowen-secret-key-32chars!!').padEnd(32).slice(0, 32)

export function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // 格式: iv(hex):tag(hex):ciphertext(hex)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decryptApiKey(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':')
  const iv  = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET), iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc) + decipher.final('utf8')
}
