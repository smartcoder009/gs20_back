const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let withAddrSchema = new Schema({
  "user_id" : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "currency" : String,
  "address" : String,
  "tag" : { type:String, default:'' },
  "status" : { type:Number, default:0 },
  "name": String,
  "ip_address": String,
  "approve_token" : { type:String, default:'' },
  "verify_token" : { type:String, default:'' },
  "created_at": { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('withdraw_addr', withAddrSchema, 'withdraw_addr');