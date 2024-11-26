const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let withdrawSchema = new Schema({
  "user_id"         : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "username"        : String,
  "amount"          : Number,
  "transfer_amount" : Number,
  "currency"        : String,
  "payment_method"  : String,
  "reference_no"    : { type:String, default:"" },
  "address_info"    : String,
  "address_tag"     : { type:String, default:"" },
  "fee_amt"         : Number,
  "with_token"      : String,
  "status"          : String,
  "confirm_code"    : String,
  "cancelled_by"    : String,
  "approve_date"    : Date,
  "reject_reason"   : String,
  "ip_address"      : { type:String, default:"" },
  "approve_ip"      : { type:String, default:"" },
  "admin_id"        : { type:String, default:"" },
  "network"         : { type:String, default:"" },
  "with_otp"        : Number,
  "created_at"      : { type:Date, default:Date.now },
  "updated_at"      : { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('withdraw', withdrawSchema,'withdraw');