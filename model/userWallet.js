const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let walletSchema = new Schema({
	"user_id" : { type: mongoose.Schema.Types.ObjectId, ref: 'user_info'}, 
	"wallet"  : [{
		"currency": { type: String }, 
		"amount"  : { type: Number, default: 0 }
	}],
  "created_at" : { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('user_wallet', walletSchema, 'user_wallet');