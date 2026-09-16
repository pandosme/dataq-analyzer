import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['admin', 'viewer'],
      default: 'viewer',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    // User preferences (override system defaults)
    preferences: {
      dateFormat: String,       // 'US', 'ISO', or 'EU'
      timeFormat: String,        // '12h' or '24h'
      timezone: String,          // IANA timezone string
      theme: String,             // 'light' or 'dark'
      videoPlayback: {
        preTime: Number,         // Seconds before event
        postTime: Number,        // Seconds after event
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get safe user object (without password)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Indexes
userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);

export default User;
