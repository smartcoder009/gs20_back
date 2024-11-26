var mongoose = require('mongoose');

var orderSchema = new mongoose.Schema({
  "user_id"     : {type: mongoose.Schema.Types.ObjectId, ref: 'user_info', index:true },
  "from_symbol" : {type:String, index:true},
  "to_symbol"   : {type:String, index:true},
  "amount"      : Number,
  "price"       : Number,
  "type"        : String,
  "fees"        : Number,
  "fee_per"     : { type:Number, default:0 },
  "total"       : Number,
  "status"      : String,
  "created_at"  : { type:Date, default:Date.now },
  "updated_at"  : { type:Date, default:Date.now }
}, {"versionKey" : false});
module.exports = mongoose.model('swap_order', orderSchema, 'swap_order')