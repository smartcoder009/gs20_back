const mongoose = require('mongoose');

let adminBank = new mongoose.Schema({
  "admin_id"       : { type: mongoose.Schema.Types.ObjectId, ref:'admin', index:true },
  "currency"       : String,
  "acc_name"       : String,
  "acc_number"     : String,
  "acc_type"       : String,
  "bank_name"      : String,
  "bank_branch"    : String,
  "bank_code"      : String,
  "bank_country"   : String,
  "purpose"        : String,
  "status"         : String,
  "created_at"     : { type: Date, default: Date.now },
  "updated_at"     : { type: Date, default: Date.now }
},{"versionKey"    : false});

module.exports = mongoose.model('admin_bank', adminBank, 'admin_bank');