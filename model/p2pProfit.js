var mongoose = require('mongoose');

var profitSchema = new mongoose.Schema({
  "user_id"     : { type: mongoose.Schema.Types.ObjectId, ref: 'user_info', index:true },
  "order_id"    : { type: mongoose.Schema.Types.ObjectId, ref: 'p2p_coin_order', index:true },
  "currency"    : String,
  "amount"      : Number,
  "type"        : String,
  "created_at"  : { type: Date, default: Date.now }
}, {"versionKey" : false});
module.exports = mongoose.model('p2p_profit', profitSchema, 'p2p_profit')