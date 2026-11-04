import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export const ask = async question => {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}
