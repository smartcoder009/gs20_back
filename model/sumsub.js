const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let balanceTransSchema = new Schema({
  "user_id"          : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "kyc_id"           : String,
  "kycrequest_id"    : String,
  "ref_user"         : String,
  "email"            : String,
  "status"           : { type:Number, default:0 },
  "created_at"       : { type:Date, default:Date.now },
  "updated_at"       : { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('balanceTrans', balanceTransSchema,'balanceTrans');