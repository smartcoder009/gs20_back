const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let depositSchema = new Schema({
  "user_id"       : { type:mongoose.Schema.Types.ObjectId, ref:'user_info' },
  "amount"        : Number,
  "reference_no"  : String,
  "payment_method": String,
  "payment_type"  : { type:String, default:'' },
  "currency"      : String,
  "currency_type" : String,
  "status"        : String,
  "block"         : String,
  "ip_address"    : String,
  "address_info"  : { type:String, default:'' },
  "fee_txid"      : { type:String, default:'' },
  "move_status"   : { type:Number, default:0 },
  "proof"         : { type:String, default:'' },
  "reason"        : { type:String, default:'' },
  "created_at"    : { type:Date, default:Date.now },
  "updated_at"    : { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('deposit', depositSchema, 'deposit');