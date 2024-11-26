const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let balanceTransSchema = new Schema({
  "user_id"          : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "amount"           : Number,
  "from_currency"    : String,
  "receive_currency" : String,
  "status"           : String,
  "send"             : String,
  "receive"          : String,
  "ip_address"       : { type:String, default:"" },
  "created_at"       : { type:Date, default:Date.now },
  "updated_at"       : { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('balanceTrans', balanceTransSchema,'balanceTrans');