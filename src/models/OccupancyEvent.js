import mongoose from 'mongoose';

const occupancyEventSchema = new mongoose.Schema(
  {
    serial: { type: String, required: true, uppercase: true, trim: true },
    area: { type: String, required: true, trim: true },
    occupancy: { type: Map, of: Number, required: true },
    timestamp: { type: Number, required: true },
    name: { type: String, default: '' },
    location: { type: String, default: '' },
  },
  { timestamps: true }
);

occupancyEventSchema.index({ serial: 1, area: 1, timestamp: -1 });
occupancyEventSchema.index({ timestamp: -1 });

const OccupancyEvent = mongoose.model('OccupancyEvent', occupancyEventSchema);

export default OccupancyEvent;