const mongoose = require('mongoose');

const mgmtRemarkSchema = new mongoose.Schema(
  {
    project: { type: String, required: true, unique: true, trim: true },
    text: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('MgmtRemark', mgmtRemarkSchema);
