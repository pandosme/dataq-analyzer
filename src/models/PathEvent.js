import mongoose from 'mongoose';

/**
 * PathEvent model - stores MQTT path messages as-is
 * Uses flexible schema to preserve original property names from MQTT
 */
const pathEventSchema = new mongoose.Schema(
  {
    // Store the entire MQTT message as-is using Mixed type
    // This preserves all original property names
  },
  {
    strict: false, // Allow any fields
    timestamps: true, // Add createdAt and updatedAt
  }
);

// Create indexes for common query patterns
// Index on common DataQ fields (using original property names)
pathEventSchema.index({ serial: 1, timestamp: -1 });
pathEventSchema.index({ serial: 1, class: 1, timestamp: -1 });
pathEventSchema.index({ timestamp: -1 });
pathEventSchema.index({ class: 1 });
pathEventSchema.index({ id: 1 }); // tracking id
// Add compound index to support efficient per-camera deletion/aggregation by creation date
pathEventSchema.index({ serial: 1, createdAt: 1 });

const PathEvent = mongoose.model('PathEvent', pathEventSchema);

export default PathEvent;
