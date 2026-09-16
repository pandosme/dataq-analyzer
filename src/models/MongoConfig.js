import mongoose from 'mongoose';

const mongoConfigSchema = new mongoose.Schema(
  {
    // Singleton pattern - only one config document should exist
    _id: {
      type: String,
      default: 'mongo-config',
    },
    host: {
      type: String,
      required: true,
      default: 'localhost',
    },
    port: {
      type: Number,
      required: true,
      default: 27017,
    },
    database: {
      type: String,
      required: true,
      default: 'dataq-analyzer',
    },
    username: {
      type: String,
      default: '',
    },
    password: {
      type: String,
      default: '',
    },
    authRequired: {
      type: Boolean,
      default: false,
    },
    // Additional options
    authSource: {
      type: String,
      default: 'admin',
    },
    ssl: {
      type: Boolean,
      default: false,
    },
    replicaSet: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const MongoConfig = mongoose.model('MongoConfig', mongoConfigSchema);

export default MongoConfig;
