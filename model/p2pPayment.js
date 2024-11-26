const mongoose = require('mongoose');

let paySchema = new mongoose.Schema({
  "order_id"       : { type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true },
  "match_id"       : { type:mongoose.Schema.Types.ObjectId, ref: 'p2p_ordertemp', index:true },
  "user_id"        : { type:Number, index:true },
  "firstcurrency"  : { type:String, index:true },
  "secondcurrency" : { type:String, index:true },
  "Amount"         : Number,
  "Price"          : Number,
  "Fee"            : Number,
  "fee_per"        : Number,
  "Total"          : Number,
  "type"           : String,
  "updated_time"   : { type:Date },
  "status"         : { type:Number, default:0 },
  "paymode"        : String,
  "created_at"     : { type:Date,  default:Date.now },
  "updated_at"     : { type:Date,  default:Date.now }
},{"versionKey" : false});

module.exports = mongoose.model('p2p_order_payment', paySchema,'p2p_order_payment');