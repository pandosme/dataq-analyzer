import mongoose from 'mongoose';

const mqttConfigSchema = new mongoose.Schema(
  {
    // Singleton pattern - only one config document should exist
    _id: {
      type: String,
      default: 'mqtt-config',
    },
    host: {
      type: String,
      required: true,
      default: 'localhost',
    },
    port: {
      type: Number,
      required: true,
      default: 1883,
    },
    protocol: {
      type: String,
      enum: ['mqtt', 'mqtts', 'ws', 'wss'],
      default: 'mqtt',
    },
    // Authentication
    username: {
      type: String,
      default: '',
    },
    password: {
      type: String,
      default: '',
    },
    // TLS / certificate settings
    useTls: {
      type: Boolean,
      default: false,
    },
    rejectUnauthorized: {
      type: Boolean,
      default: true,   // false = trust self-signed certs
    },
    caCert: {
      type: String,
      default: '',     // PEM-encoded CA certificate
    },
    clientCert: {
      type: String,
      default: '',     // PEM-encoded client certificate
    },
    clientKey: {
      type: String,
      default: '',     // PEM-encoded client private key
    },
    // Topic subscription
    topicPrefix: {
      type: String,
      default: 'dataq/#',
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for brokerUrl built from parts
mqttConfigSchema.virtual('brokerUrl').get(function () {
  const proto = this.useTls ? 'mqtts' : (this.protocol === 'ws' || this.protocol === 'wss' ? this.protocol : 'mqtt');
  return `${proto}://${this.host}:${this.port}`;
});

const MqttConfig = mongoose.model('MqttConfig', mqttConfigSchema);

export default MqttConfig;
