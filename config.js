export default {
  botName: 'Raphtalia-MD',
  prefixes: ['.', '/', '!', '#'],
  owners: ['5210000000000'],
  sessionDir: 'session',
  jadibotDir: 'session-jadibot',
  jadibotYieldToMain: true,
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
