import mongoose from 'mongoose';

/**
 * A device the operator has permanently removed.
 *
 * Auto-discovery creates a camera for any serial that announces itself on
 * dataq/connect/+, and brokers replay retained announcements to every new
 * subscriber — so without a record of the removal, a permanently deleted device
 * reappears the next time the application restarts. Archiving is remembered on
 * the camera document itself; a purge leaves nothing behind, which is what this
 * exists for.
 */
const dismissedDeviceSchema = new mongoose.Schema(
  {
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    // Kept only so the operator can recognise what a serial referred to.
    name: {
      type: String,
      default: '',
    },
    dismissedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('DismissedDevice', dismissedDeviceSchema);
