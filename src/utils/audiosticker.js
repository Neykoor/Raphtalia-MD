import { randomBytes } from 'node:crypto'
import { prepareWAMessageMedia, proto } from 'baileys'

const patchProto = () => {
  const Message = proto?.Message
  if (!Message || Message.__audioStickerPatched) return

  const sticker = Message.StickerMessage

  if (sticker?.encode && Message.AudioMessage?.encode) {
    const encodeSticker = sticker.encode

    sticker.encode = function (message, writer) {
      const audio = message?.audioMessage
      if (audio) delete message.audioMessage

      const result = encodeSticker.call(this, message, writer)

      if (audio) {
        message.audioMessage = audio
        Message.AudioMessage.encode(audio, result.uint32(210).fork()).ldelim()
      }

      return result
    }

    if (sticker.fromObject) {
      const fromSticker = sticker.fromObject

      sticker.fromObject = function (object) {
        const result = fromSticker.call(this, object)
        if (object?.audioMessage) {
          result.audioMessage = Message.AudioMessage.fromObject ? Message.AudioMessage.fromObject(object.audioMessage) : object.audioMessage
        }
        return result
      }
    }
  }

  const encodeMessage = Message.encode

  Message.encode = function (message, writer) {
    const audioSticker = message?.audioStickerMessage

    if (audioSticker) {
      delete message.stickerMessage
      delete message.audioStickerMessage
    }

    const result = encodeMessage.call(this, message, writer)

    if (audioSticker && Message.FutureProofMessage) {
      message.audioStickerMessage = audioSticker
      Message.FutureProofMessage.encode(audioSticker, result.uint32(1074).fork()).ldelim()
    }

    return result
  }

  if (Message.fromObject) {
    const fromMessage = Message.fromObject

    Message.fromObject = function (object) {
      const result = fromMessage.call(this, object)

      if (object?.audioStickerMessage) {
        const inner = object.audioStickerMessage.message || object.audioStickerMessage
        result.audioStickerMessage = { message: inner }
        delete result.stickerMessage
        if (inner) Object.setPrototypeOf(result, inner)
      }

      return result
    }
  }

  Message.__audioStickerPatched = true
}

const prepareVoice = async (sock, voice) => {
  const prepared = await prepareWAMessageMedia(
    { audio: voice.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true },
    { upload: sock.waUploadToServer }
  )

  const node = prepared.audioMessage
  node.seconds = voice.seconds
  node.ptt = true
  node.mimetype = 'audio/ogg; codecs=opus'
  return node
}

export const sendAudioSticker = async (sock, chat, sticker, animated, voice) => {
  patchProto()

  const audio = await prepareVoice(sock, voice)
  const prepared = await prepareWAMessageMedia({ sticker, isAnimated: animated }, { upload: sock.waUploadToServer })

  prepared.stickerMessage.isAnimated = animated
  prepared.stickerMessage.audioMessage = audio

  const payload = {
    __proto__: prepared,
    audioStickerMessage: { message: prepared },
    messageContextInfo: { messageSecret: randomBytes(32) }
  }

  await sock.relayMessage(chat, payload, {})
}
