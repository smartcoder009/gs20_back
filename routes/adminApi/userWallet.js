let express = require('express');
let router = express.Router();
let async  = require('async');
let mongoose = require('mongoose');
let ObjectId = mongoose.Types.ObjectId;
let currency = require('../../model/currency');
let wallet   = require('../../model/userWallet');
let address = require('../../model/userAddress');

let response = {};
let updatedDate = ()=>{
	return new Date();
};

router.get('/userWalletList/:id', (req, res) => {
	let values = req.params.id;  
	wallet.aggregate([
	{
		$match: {
		"user_id": new ObjectId(values)
		}
	},
	{$unwind: "$wallet"},
	{   
	$lookup: {        
		from: "currency",        
		localField: "wallet.currency",        
		foreignField: "symbol",        
		as: "currencyid"
	}  
	},	
	{$project : {		
		currencyid: {"currencySymbol":{$arrayElemAt:["$currencyid.symbol",0]}},
		"walletbalance":"$wallet.amount",		
		_id:0
	}}
	]).exec(function(err_wallet,resData_wallet){ 
		res.json({ status : true,data: resData_wallet })
	});
});


router.get('/userAddress/:id', (req, res) => {
	let value = req.params.id;
  address.find({'user_id':value},{currency:1, address:1, _id:0}).exec(function(error,resData){
  if(resData){
		  return res.json({status : true, data:resData});
		} else {
			return res.json({status : false, msg:"Invalid Request"});
		}
  });
});

module.exports = router;