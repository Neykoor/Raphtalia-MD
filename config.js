export default {
  botName: 'Raphtalia-MD',
  currency: 'Yenes',
  channelLink: 'https://whatsapp.com/channel/0029Vb9Rmzf23n3mht3Cz92J',
  prefixes: ['.', '/', '!', '#'],
  owners: ['5216631079388', '5214811571950'],
  sessionDir: 'session',
  jadibotDir: 'session-jadibot',
  jadibotYieldToMain: true,
  downloads: {
    timeoutMs: 30000,
    maxVideoMb: 50,
    maxFileMb: 500,
    providerTimeoutMs: 25000,
    siputzx: 'https://api.siputzx.my.id',
    tikwm: 'https://www.tikwm.com',
    vreden: 'https://api.vreden.web.id',
    ootaizumi: 'https://api.ootaizumi.web.id',
    delirius: 'https://api.delirius.online',
    zenzxz: 'https://api.zenzxz.my.id',
    lempi: 'https://api.lempi.lat',
    fare: 'https://fare.ink',
    keys: {
      lempi: 'montekey28',
      anabot: 'freeApikey'
    },
    ytdl: {
      url: '',
      key: ''
    },
    ytdlp: {
      path: 'yt-dlp',
      extraArgs: ''
    }
  },
  nsfw: {
    rule34: { userId: '', apiKey: '' },
    gelbooru: { userId: '', apiKey: '' }
  },
  timezone: 'America/Bogota',
  loginMethod: 'ask',
  pairingNumber: '',
  reconnectDelayMs: 3000,
  messageCacheSize: 1000,
  messageCacheTtlMs: 3600000,
  groupCacheSize: 500,
  groupCacheTtlMs: 300000,
  mediaCacheTtlMs: 1800000,
  messages: {
    owner: 'Este comando es solo para el owner.',
    group: 'Este comando solo funciona en grupos.',
    private: 'Este comando solo funciona en chat privado.',
    admin: 'Este comando es solo para administradores del grupo.',
    botAdmin: 'Necesito ser administrador del grupo para usar este comando.',
    error: 'Ocurrió un error al ejecutar el comando.'
  }
}
