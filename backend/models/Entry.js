const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema(
  {
    project: { type: String, required: true, trim: true },
    milestone: { type: String, default: '', trim: true },
    current: { type: Number, default: 0 },   // committed value, in ₹ Cr
    potential: { type: Number, default: 0 }, // full scaled potential, in ₹ Cr
    date: { type: Date, default: null },     // expected invoice date
    bucketOverride: {
      type: String,
      enum: ['auto', 'short', 'mid', 'long'],
      default: 'auto',
    },
    status: { type: String, default: '', trim: true },
    remarks: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Entry', entrySchema);
