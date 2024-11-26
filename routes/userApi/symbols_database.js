"use strict";

/* global exports */
var https = require("https");
// var https = require("http");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
var symbols = [ {"name":"ETH_BTC","description":"ETH","exchange":"ETH","type":"crypto"} ];

exports.initGetAllMarketsdata = (req,res) => {
	let url = 'localhost';
	var post_options = {
		host: url,
		"rejectUnauthorized": false, 
		path: "/trade/markets",
		method: "GET",
		port: "13784"
	};

	// Set up the request
	var request = https.request(post_options, response => {
		var result = "";
		response.setEncoding("utf8");
		response.on("data", chunk => {
			result += chunk;
		});
		response.on("end", () => {
			if (response.statusCode !== 200) {
				return;
			}
			var receivedData = JSON.parse(result);
			var newCuurencyArray = receivedData.map(item => {
				var blankObj = {};
				item.name = item.from.toUpperCase()+'_'+item.to.toUpperCase();
				blankObj["name"] = item.name;
				blankObj["description"] = item.name;
				blankObj["exchange"] = item.exchange;
				blankObj["type"] = "crypto";
				return blankObj;
			});
			this.addSymbols(newCuurencyArray);
		});
	});
	request.on("error", function (e) {
		// console.log("problem with request: ", e.message);
	});
	request.end();
};

function searchResultFromDatabaseItem(item) {
	return {
		symbol: item.name,
		full_name: item.name,
		description: item.description,
		exchange: item.exchange,
		type: item.type
	};
}

exports.search = function (searchString, type, exchange, maxRecords) {
	var MAX_SEARCH_RESULTS = !!maxRecords ? maxRecords : 50;
	var results = []; // array of WeightedItem { item, weight }
	var queryIsEmpty = !searchString || searchString.length === 0;
	var searchStringUpperCase = searchString.toUpperCase();

	for (var i = 0; i < symbols.length; ++i) {
		var item = symbols[i];
		if (type && type.length > 0 && item.type != type) {
			continue;
		}
		if (exchange && exchange.length > 0 && item.exchange != exchange) {
			continue;
		}

		var positionInName = item.name.toUpperCase().indexOf(searchStringUpperCase);
		var positionInDescription = item.description.toUpperCase().indexOf(searchStringUpperCase);

		if (queryIsEmpty || positionInName >= 0 || positionInDescription >= 0) {
			var found = false;
			for (var resultIndex = 0; resultIndex < results.length; resultIndex++) {
				if (results[resultIndex].item == item) {
					found = true;
					break;
				}
			}
			if (!found) {
				var weight = positionInName >= 0 ? positionInName : 8000 + positionInDescription;
				results.push({
					item: item,
					weight: weight
				});
			}
		}
	}

	return results
		.sort(function (weightedItem1, weightedItem2) {
			return weightedItem1.weight - weightedItem2.weight;
		})
		.map(function (weightedItem) {
			return searchResultFromDatabaseItem(weightedItem.item);
		})
		.slice(0, Math.min(results.length, MAX_SEARCH_RESULTS));
};

exports.addSymbols = function (newSymbols) {
	symbols = symbols.concat(newSymbols);
};

exports.symbolInfo = function (symbol) {
	var data = symbol.split('_');
	return { "name":symbol, "description":symbol, "exchange":"GS20Exchange", "type":"crypto" };
};