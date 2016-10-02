var Discord = require('discord.io'),
	config = require('./config'),
	bot = new Discord.Client({
		autorun: true,
		token: config.TOKEN,
	}),
	chalk = require('chalk'),
	replyTo = function(userID, message){
		return "<@"+userID+"> "+message;
	},
	replyToIfNotPM = function(isPM, userID, message){
		if (isPM) return message;
		return replyTo(userID, message);
	},
	respond = function(channelID, message){
		return bot.sendMessage({
			to: channelID,
			message: message,
		});
	},
	readline = require('readline'),
	rl,
	getRl = function(){
		if (typeof rl === 'undefined')
			rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
		return rl;
	},
	unirest = require('unirest'),
	moment = require('moment'),
	YouTube = require('youtube-node'),
	yt = new YouTube(),
	OurServer,
	exec,
	defineCommandLastUsed,
	defineTimeLimit = 20000;

yt.setKey(config.YT_API_KEY);

require("console-stamp")(console, {
	formatter: function(){
		return moment().format('YYYY-MM-DD HH:MM:ss.SSS');
	},
	label: false,
});

bot.on('ready', ready);

function ready(){
	var i;

	bot.setPresence({ idle_since: null });
	console.log('Logged in as '+bot.username);

	var serverIDs = Object.keys(bot.servers),
		getClientID = function(){
			if (typeof config.CLIENT_ID !== 'undefined')
				return config.CLIENT_ID;
			else getRl().question('Enter app Client ID (or ^C to exit): ', function(answer){
				if (/\D/.test(answer))
					return console.log('> ID must be numeric, try again (or ^C to exit): ');
				rl.close();
				return answer;
			});
		},
		getAuthURL = function(){
			return 'https://discordapp.com/oauth2/authorize?client_id='+getClientID()+'&scope=bot&permissions=0';
		};
	if (serverIDs.length === 0){
		console.log('Bot is not part of any server. To join the bot to a server, get your client ID from https://discordapp.com/developers/applications/me and enter it below.');

		var openAuthPage = function(clientID){
			var url = getAuthURL();
			if (config.LOCAL){
				console.log('Opening default browser to authorization URL ('+url+')');
				var browser = require('opener')(url);
				browser.unref();
				browser.stdin.unref();
				browser.stdout.unref();
				browser.stderr.unref();
			}
			else console.log('Open '+url+' in your favourite browser to continue.');
			getRl().question('When you\'re done, press enter to re-run script (or ^C to exit)', function(){
				console.log('Reconnecting...\n');
				bot.disconnect();
				bot.connect();
				ready();
			});
		};

		openAuthPage();
		return;
	}

	OurServer = bot.servers[config.SERVER_ID];
	if (typeof OurServer === 'undefined'){
		console.log('Could not find Our server, listing currently joined servers:\n');
		for (i=0; i<serverIDs.length; i++){
			var id = serverIDs[i];
			console.log('    '+id+' '+'('+bot.servers[id].name+')');
		}
		console.log('\nSet one of the IDs above as the SERVER_ID configuration option.\nTo join the bot to another server, visit '+getAuthURL());
		process.exit();
	}
	console.log('Found Our server ('+OurServer.name+')');

	var OurRoleIDs = {},
		OurChannelIDs = {},
		staffRoleID;
	for (i in OurServer.roles){
		if (!OurServer.roles.hasOwnProperty(i))
			continue;

		var role = OurServer.roles[i];
		OurRoleIDs[role.name] = role.id;
		if (typeof staffRoleID === 'undefined' && role.name === config.STAFFROLE_NAME)
			staffRoleID = role.id;
	}
	if (typeof staffRoleID === 'undefined')
		console.log('Staff role name must be set to enable admin-only functionality.');
	for (i in OurServer.channels){
		if (!OurServer.channels.hasOwnProperty(i))
			continue;

		var channel = OurServer.channels[i];
		OurChannelIDs[channel.name] = channel.id;
	}

	var isOwner = function(userID){
			return userID === config.OWNER_ID;
		},
		isStaff = function(userID){
			return OurServer.members[userID].roles.indexOf(staffRoleID) !== -1;
		},
		isMember = function(userID){
			return OurServer.members[userID].roles.indexOf(OurRoleIDs['Club Members']) !== -1;
		},
		hasOwner = typeof config.OWNER_ID === 'string' && config.OWNER_ID.length,
		myIDran = false,
		limitedFunc = ', functionality is limited.\nUse the /myid command to get your ID';

	if (!hasOwner)
		console.log('Bot has no owner'+limitedFunc);
	else {
		if (typeof bot.users[config.OWNER_ID] === 'undefined'){
			hasOwner = false;
			console.log('The configured owner is not among the channel members'+limitedFunc);
		}
		else {
			var _owner = bot.users[config.OWNER_ID];
			console.log('Owner is '+_owner.username+' ('+_owner.id+')');
		}
	}

	console.log('And now, we wait...\n');

	function addErrorMessageToResponse(err, response){
		if (err)
			response += '\n('+(hasOwner?'<@'+config.OWNER_ID+'> ':'')+err.message+(err.response?': '+err.response.message:'')+')';
		return response;
	}

	function wipeMessage(channelID, messageID, response, userID){
		bot.deleteMessage({
			channelID: channelID,
			messageID: messageID,
		},function(err){
			var callback = function(msg){
				if (!msg)
					return;
				respond(channelID, userID ? replyTo(userID, msg) : msg);
			};
			if (typeof response === 'function'){
				callback = response;
				response = '';
			}
			response = addErrorMessageToResponse(err, response);
			callback(response, Boolean(err));
		});
	}

	var everyone = function(){ return true },
		commands = [
			{
				name: 'channels',
				desc: 'Returns available channels on Our server (used for initial script setup)',
				perm: isOwner,
			},
			{
				name: 'myid',
				desc: 'Returns your user ID (used for initial script setup)',
				perm: isOwner,
			},
			{
				name: 'roleids',
				desc: 'Returns a list of rel IDs on the server',
				perm: isOwner,
			},
			{
				name: 'ver',
				desc: 'Returns the bot\'s version number & when that version was created',
				perm: everyone,
			},
			{
				name: 'casual',
				desc: 'Politely asks everyone in the room to move to the <#'+OurChannelIDs.casual+'> channel (does nothing in #casual)',
				perm: everyone,
			},
			{
				name: 'cg',
				desc: 'Can be used to search the Vector Club\'s official Color Guide',
				perm: everyone,
			},
			{
				name: 'google',
				desc: 'Perform an "I\'m feeling lucky" google search and return the result',
				perm: everyone,
			},
			{
				name: 'kym',
				desc: 'Search entries of Know Your Meme, a popular wiki of Internet memes',
				perm: everyone,
			},
			{
				name: 'youtube',
				desc: 'Search for YouTube videos - results are based on US region & English language',
				perm: everyone,
				aliases: ['yt'],
			},
			{
				name: 'derpi',
				desc: 'Returns the first result of a Derpibooru search',
				perm: everyone,
				aliases: ['db'],
			},
			{
				name: 'nsfw',
				desc: 'Lets everyone know to keep saucy mesages out of regular rooms (does nothing in #nsfw)\n\tThe optional parameter allows any user to join/leave the NSFW channel at will',
				perm: everyone,
			},
			{
				name: 'define',
				desc: 'Finds definitions, synonyms and meanings for words using the WordsAPI',
				perm: everyone,
				aliases: ['def'],
			},
			{
				name: 'rekt',
				desc: 'Apply cold water to the burnt area',
				perm: everyone,
			},
		];

	function getVersion(channelID, userID, callback){
		exec = exec || require('child_process').exec;
		exec('git rev-parse --short=4 HEAD', function(_, version){
			var m, privateMsg = userID === channelID;
			if (_){
				console.log('Error getting version', _);
				m = 'Error while getting version number' + (hasOwner ? ' (<@' + config.OWNER_ID + '> Logs may contain more info)' : '');
				return respond(channelID, !privateMsg ? replyTo(userID, m): m);
			}
			exec('git log -1 --date=short --pretty=format:%ci', function(_, ts){
				if (_){
					console.log('Error getting creation time', _);
					m = 'Error while getting creation time' + (!privateMsg && hasOwner ? ' (<@' + config.OWNER_ID + '> Logs may contain more info)' : '');
					return respond(channelID,  !privateMsg ? replyTo(userID, m): m);
				}

				return callback(version.trim(), ts);
			});
		});
	}

	function CallCommand(userID, channelID, message, event, userIdent, command, argStr, args){
		var i,l, isPM = typeof bot.channels[channelID] === 'undefined';
		command = command.toLowerCase();
		switch (command){
			case "help": (function(){
				var msg = 'Commands must be prefixed with `!` or `/`. Here\'s a list of commands __you__ can run:\n\n';
				for (i=0,l=commands.length; i<l; i++){
					var cmd = commands[i];
					if (cmd.perm(userID))
						msg += ' ● `'+cmd.name+'`'+(cmd.desc?' - '+cmd.desc:'')+(cmd.aliases?' (Aliases: `'+(cmd.aliases.join('`, `'))+'`)':'')+'\n';
				}
				if (!isPM)
					wipeMessage(channelID, event.d.id);
				respond(userID, msg.trim()+'\n\nMost commands have an explanation which you can access by sending the command in any channel or as a PM to the bot __without any arguments__.');
			})(); break;
			case "channels": (function(){
				if (!isOwner(userID))
					respond(channelID, replyTo(userID, 'You must be owner to use this command'));

				var ids = [];
				for (i in OurServer.channels){
					if (OurServer.channels.hasOwnProperty(i)){
						var channel = OurServer.channels[i];
						ids.push(channel.id+' ('+(channel.type==='text'?'#':'')+channel.name+')');
					}
				}
				respond(channelID, replyTo(userID, "Channels on this server:\n```"+ids.join('\n')+'```'));
			})(); break;
			case "myid": (function(){
				if (!hasOwner){
					if (myIDran)
						return respond(channelID, replyTo(userID, 'This command can only be executed once per server start-up until the owner\'s ID is set'));
					else myIDran = true;
				}
				else if (!isOwner(userID))
					return respond(channelID, replyTo(userID, 'You must be owner to use this command'));

				respond(channelID, replyTo(userID, 'Your user ID was sent to you in a private message'));
				respond(userID, 'Your user ID is `'+userID+'`');
			})(); break;
			case "roleids": (function(){
				if (!isOwner(userID))
					respond(channelID, replyTo(userID, 'You must be owner to use this command'));

				var message = [],
					keys = Object.keys(OurRoleIDs);
				keys.forEach(function(key){
					message.push(OurRoleIDs[key]+' ('+key+')');
				});
				respond(channelID, replyTo(userID, 'List of available roles:\n```\n'+message.join('\n')+'\n```'));
			})(); break;
			case "ver": (function(){
				bot.simulateTyping(channelID);

				getVersion(channelID,userID,function(ver,ts){
					respond(channelID, replyTo(userID, 'Bot is running version `'+ver+'` created '+(moment(ts).fromNow())+'\nView commit on GitHub: http://github.com/ponydevs/MLPVC-BOT/commit/'+ver));
				});
			})(); break;
			case "casual": (function(){
				if (channelID === OurChannelIDs.casual)
					return wipeMessage(channelID, event.d.id);

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				var possible_images = [
						'mountain', // Original by DJDavid98
									// RIP IN PEPPERONI (Coco & Rarity by Pirill) ;_;7
						'abcm',     // Applebloom's new CM by Drakizora
						'abfall',   // Applebloom falling by Drakizora
						'abfloat',  // CMs floating around Applebloom by Drakizora
					],
					image_count = possible_images.length,
					data = args[0],
					k;

				if (!isNaN(data))
					k = Math.max(0,Math.min(image_count-1,parseInt(data, 10)-1));
				else {
					k = moment().minutes() % image_count;
				}

				wipeMessage(channelID, event.d.id, 'Please continue this discussion in <#'+OurChannelIDs.casual+'>\nhttps://mlpvc-rr.ml/img/casual/'+possible_images[k]+'.png');
			})(); break;
			case "cg": (function(){
				if (!args.length)
					return respond(channelID, replyToIfNotPM(isPM, userID, 'This command can be used to quickly link to an appearance using the site\'s  "I\'m feeling lucky" search'));

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				bot.simulateTyping(channelID);
				unirest.get('https://mlpvc-rr.ml/cg/1?js=true&q='+encodeURIComponent(argStr)+'&GOFAST=true')
					.header("Accept", "application/json")
					.end(function (result) {
						if (result.error || typeof result.body !== 'object'){
							console.log(result.error, result.body);
							return respond(channelID, replyTo(userID, 'Color Guide search failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
						}

						var data = result.body;
						if (!data.status)
							return respond(channelID, replyTo(userID, data.message));

						respond(channelID, replyTo(userID, 'https://mlpvc-rr.ml'+data.goto));
					});
			})(); break;
			case "kym": (function(){
				if (!args.length)
					return respond(channelID, replyToIfNotPM(isPM, userID, 'This command can be used to find the Know Your Meme entry for a meme.'));

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				bot.simulateTyping(channelID);
				var apiurl = 'http://rkgk.api.searchify.com/v1/indexes/kym_production/instantlinks?query='+encodeURIComponent(argStr)+'&field=name&fetch=url&function=10&len=1';
				unirest.get(apiurl)
					.header("Accept", "application/json")
					.end(function (result) {
						if (result.error || typeof result.body !== 'object' || [302, 200].indexOf(result.status) === -1){
							console.log(result.error, result.body);
							return respond(channelID, replyTo(userID, 'Know Your Meme search failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
						}

						var data = result.body;
						if (!data.results.length || typeof data.results[0].url !== 'string')
							return respond(channelID, replyTo(userID, 'Know Your Meme search returned no results.'));

						respond(channelID, replyTo(userID, 'http://knowyourmeme.com'+data.results[0].url));
					});
			})(); break;
			case "google": (function(){
				if (!args.length)
					return respond(channelID, replyToIfNotPM(isPM, userID, 'This command can be used to perform an "I\'m feeling lucky" Google search and return the first result.'));

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				bot.simulateTyping(channelID);
				var searchUrl = 'https://google.com/search?q='+encodeURIComponent(argStr);
				unirest.get(searchUrl+'&btnI')
					.followRedirect(function(res){
						if (typeof res.headers.location !== 'string')
							return true;

						return /(www\.)google\.((co\.)?[a-z]+)/.test(require('url').parse(res.headers.location).host);
					})
					.end(function(result){
						if (result.error || [302, 200].indexOf(result.status) === -1){
							console.log(result.error, result.body, result.headers);
							return respond(channelID, replyTo(userID, 'Google search failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
						}

						if (typeof result.headers.location !== 'string')
							return respond(channelID, replyTo(userID, 'No obvious first result. Link to search page: '+searchUrl));

						return respond(channelID, replyTo(userID, result.headers.location));
					});
			})(); break;
			case "youtube":
			case "yt": (function(){
				if (!args.length)
					return respond(channelID, replyToIfNotPM(isPM, userID, 'This command can be used to return the first result of a YouTube search'));

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				bot.simulateTyping(channelID);
				yt.addParam('type', 'video');
				yt.addParam('regionCode', 'US');
				yt.addParam('relevanceLanguage', 'en');
				yt.search(argStr, 1, function(error, result) {
					if (error || typeof result.items === 'undefined'){
						console.log(error, result.items);
						return respond(channelID, replyTo(userID, 'YouTube search failed. '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
					}

					if (typeof result.items[0] === 'undefined' || typeof result.items[0].id.videoId === 'undefined')
						return respond(channelID, replyTo(userID, 'YouTube search returned no results.'));

					respond(channelID, replyTo(userID, 'https://youtube.com/watch?v='+result.items[0].id.videoId));
				});
			})(); break;
			case "db":
			case "derpi": (function(){
				if (!args.length)
					return respond(channelID, replyToIfNotPM(isPM, userID,
						'This command can be used to return the first result of a Derpibooru search.\n'+
						'**Note:** Any rooms aside from <#'+OurChannelIDs.nsfw+'> will only show results accessible by the site\'s default filter\n\n'+
						'__**Bot-secific search keywords:**__\n\n'+
						' ● `o:<desc|asc>` - Order of the results (if ommited, defaults to `desc`)\n'+
						' ● `by:<score|relevance|width|height|comments|random>` - Same as "Sort by" on the actual site\n\n'+
						'*Examples:* `/derpi safe,o:asc`, `/derpi safe,rd o:asc`, `/derpi ts by:random`'
					));

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				bot.simulateTyping(channelID);
				var query = argStr,
					extra = '',
					inNSFW = channelID === OurChannelIDs.nsfw,
					orderTest = /\bo:(desc|asc)\b/i,
					sortbyTest = /\bby:(score|relevance|width|height|comments|random)\b/i,
					respondWithImage = function(image){
						if (!image.is_rendered){
							var tries = typeof this.tries === 'undefined' ? 1 : this.tries;
							if (tries > 2)
								return respond(channelID, replyTo(userID, 'The requested image is not yet processed by Derpibooru, please try again in a bit'));
							return setTimeout(function(){
								CallCommand.call({ tries: tries+1}, userID, channelID, message, event, userIdent, command, argStr, args);
							}, 1000);
						}

						respond(channelID, replyTo(userID, 'http://derpibooru.org/'+image.id+'\nhttps:'+(image.image.replace(/__[^.]+(.\w+)$/,'$1'))));
					};
				if (inNSFW)
					extra += '&filter_id=56027';
				if (sortbyTest.test(query)){
					var sortby = query.match(sortbyTest);
					query = query.replace(sortbyTest, '').trim();
					extra += '&sf='+sortby[1];
					if (!query.length && sortby[1] === 'random'){
						console.log('Derpi search for random image (without tags)');
						return unirest.get('https://derpibooru.org/images/random.json')
							.header("Accept", "application/json")
							.end(function(result){
								if (result.error || typeof result.body !== 'object'){
									console.log(result.error, result.body);
									return respond(channelID, replyTo(userID, 'Derpibooru random image search failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
								}

								var data = result.body;
								if (typeof data.id === 'undefined')
									return respond(channelID, replyTo(userID, 'Failed to get random Derpibooru image ID'));

								unirest.get('https://derpibooru.org/images/'+data.id+'.json')
									.header("Accept", "application/json")
									.end(function(result){
									if (result.error || typeof result.body !== 'object'){
										console.log(result.error, result.body);
										return respond(channelID, replyTo(userID, 'Derpibooru random image data retrieval failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
									}

									respondWithImage(result.body);
								});
							});
					}
				}

				if (orderTest.test(query)){
					var order = query.match(orderTest);
					query = query.replace(orderTest, '').trim();
					extra += '&sd='+order[1];
				}
				query = query.replace(/,{2,}/g,',').replace(/(^,|,$)/,'');
				var url = 'https://derpibooru.org/search.json?q='+encodeURIComponent(query)+extra;
				console.log('Derpi search for '+chalk.blue(url));
				unirest.get(url)
					.header("Accept", "application/json")
					.end(function(result){
						if (result.error || typeof result.body !== 'object'){
							console.log(result.error, result.body);
							return respond(channelID, replyTo(userID, 'Derpibooru search failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
						}

					var data = result.body;
					if (typeof data.search === 'undefined' || typeof data.search[0] === 'undefined')
						return respond(channelID, replyTo(userID, 'Derpibooru search returned no results.'+
							(
								/(explicit|questionable|suggestive)/.test(query) && !inNSFW ?
								' Searching for system tags other than `safe` is likely to produce no results outside the <#'+OurChannelIDs.nsfw+'> channel.' :''
							)+' Don\'t forget that artist and OC tags need to be prefixed with `artist:` and `oc:` respectively.'
						));

					respondWithImage(data.search[0]);
				});
			})(); break;
			case "nsfw": (function(){
				if (typeof OurServer.channels[channelID] !== 'undefined' && OurServer.channels[channelID].name === 'nsfw' && args[0] !== 'leave')
					return;
				if (!args.length)
					return wipeMessage(channelID, event.d.id, channelID === OurChannelIDs.nsfw ? null : 'Please avoid discussing anything NSFW in <#'+channelID+'>. We have a dedicated invite-only NSFW channel, send `/nsfw join` to join. http://i.imgur.com/jaNBZ09.gif');

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				switch (args[0]){
					case "join":
						wipeMessage(channelID, event.d.id,function(msg, error){
							if (OurServer.members[userID].roles.indexOf(staffRoleID) !== -1)
								return respond(userID, 'Because you have the Staff role you will see the <#'+OurChannelIDs.nsfw+'> channel no matter what.\nIf you don\'t wand to be notified of new messages, right-click the channel and click `Mute #nsfw`');
							else if (OurServer.members[userID].roles.indexOf(OurRoleIDs['Pony Sauce']) !== -1)
								return respond(userID, 'You are already a member of the #nsfw channel. To leave, send `/nsfw leave` in any channel.\n(**Notice:** Messages sent in PMs are ignored!)');

							bot.addToRole({
								serverID: OurServer.id,
								userID: userID,
								roleID: OurRoleIDs['Pony Sauce'],
							},function(err){
								if (!err && error)
									console.log('Error while adding Pony Sauce role to '+userIdent+error);

								var response = err ? 'Failed to join <#'+OurChannelIDs.nsfw+'> channel' :'';

								response = addErrorMessageToResponse(err, response);

								if (response)
									return respond(channelID, response);

								OurServer.members[userID].roles.push(OurRoleIDs['Pony Sauce']);

								respond(OurChannelIDs.nsfw, replyTo(userID, 'Welcome aboard. If at any point you wish to leave the channel, use `/nsfw leave`'));
							});
						});
					break;
					case "leave":
						wipeMessage(channelID, event.d.id,function(msg, error){
							if (OurServer.members[userID].roles.indexOf(staffRoleID) !== -1)
								return respond(userID, 'Because you have the Staff role you will see the <#'+OurChannelIDs.nsfw+'> channel no matter what.\nIf you don\'t wand to be notified of new messages, right-click the channel and click `Mute #nsfw`');
							else if (OurServer.members[userID].roles.indexOf(OurRoleIDs['Pony Sauce']) === -1)
								return respond(userID, 'You are not a member of the #nsfw channel. To join, send `/nsfw join` in any channel.\n(**Notice:** Messages sent in PMs are ignored!)');

							bot.removeFromRole({
								serverID: OurServer.id,
								userID: userID,
								roleID: OurRoleIDs['Pony Sauce'],
							},function(err){
								if (!err && error)
									console.log('Error while removing Pony Sauce role from '+userIdent+error);

								var response = addErrorMessageToResponse(err, '');

								if (response)
									return respond(channelID, replyTo(userID, response));

								OurServer.members[userID].roles.splice(OurServer.members[userID].roles.indexOf(OurRoleIDs['Pony Sauce']), 1);

								respond(OurChannelIDs.nsfw, replyTo(userID, 'left the channel'));
							});
						});
					break;
				}
			})(); break;
			case "rekt":
				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				respond(channelID, '**REKT** https://www.youtube.com/watch?v=tfyqk26MqdE');
			break;
			case "def":
			case "define": (function(){
				if (!args.length)
					return respond(channelID, replyToIfNotPM(isPM, userID, 'This command can be used to get definitions, synonyms and example usages of English words, powered by WordsAPI (https://www.wordsapi.com/). \n**Note:** The API is free to use for up to 2500 requests per day. If exceeded, it has additional costst on a per-request basis, and as such it is rate limited to one use every 20 seconds. Only use this command when approperiate.'));

				if (isPM)
					return respond(channelID, 'This command must be used on the server');

				var delta;
				if (typeof defineCommandLastUsed === 'undefined')
					defineCommandLastUsed = Date.now();
				else if ((delta = Date.now() - defineCommandLastUsed) < defineTimeLimit && !isOwner(userID)){
					return wipeMessage(channelID, event.d.id, function(){
						respond(userID, 'The `define` command is limited to one use every '+(defineTimeLimit/1000)+' seconds due to monthly API request limits (which, after exceeded, cost money per each request). Try again in '+(Math.round((delta/100))/10)+'s');
					});
				}
				else defineCommandLastUsed = Date.now();

				if (channelID === OurChannelIDs['bot-sandbox'] && !isStaff(userID))
					return respond(channelID, replyTo(userID, 'This command can only be used by members of the Staff role in <#'+channelID+'>. Please only use this command when neccessary as it\'s number of requests per day is limited.'));

				unirest.get("https://wordsapiv1.p.mashape.com/words/"+encodeURIComponent(argStr))
					.header("X-Mashape-Key", config.MASHAPE_KEY)
					.header("Accept", "application/json")
					.end(function (result) {
						if ((result.error || typeof result.body !== 'object') && result.status !== 404){
							console.log(result.error, result.body);
							return respond(channelID, replyTo(userID, 'WordsAPI search failed (HTTP '+result.status+'). '+(hasOwner?'<@'+config.OWNER_ID+'>':'The bot owner')+' should see what caused the issue in the logs.'));
						}

						var data = result.body;
						if (result.status === 404 || !data.results || data.results.length === 0)
							return respond(channelID, replyTo(userID, 'WordsAPI search returned no results.'+(/s$/.test(argStr)?' Plural words can cause this issue. If you used a plural word, please use the singluar form instead.':'')));

						var defs = [];
						data.results.slice(0,4).forEach(function(def){
							defs.push(
								(data.results.length>1?(defs.length+1)+'. ':'')+def.partOfSpeech+' — '+def.definition+
								(def.examples&&def.examples.length?'\n\t\t__Examples:__ *“'+(def.examples.slice(0,2).join('”, “').replace(new RegExp('('+data.word+')','g'),'__$1__'))+'”*':'')+
								(def.synonyms&&def.synonyms.length?'\n\t\t__Synonyms:__ '+def.synonyms.slice(0,4).join(', '):''));
						});
						return respond(channelID, replyTo(userID, '\n**'+data.word+'** • /'+data.pronunciation.all+'/'+(data.syllables&&data.syllables.list&&data.syllables.list.length>1?' • *'+data.syllables.list.join('-')+'*':'')+'\n'+(defs.join('\n\n'))));
					});
			})(); break;
			default:
				var isProfanity = !isPM && ProfanityFilter(userID, channelID, message, event);
				if (!isProfanity){
					var notfound = 'Command /'+command+' not found';
					console.log(notfound);
					bot.sendMessage({
						to: channelID,
						message: replyTo(userID, notfound),
					});
				}
		}
	}

	function ProcessCommand(userID, channelID, message, event){
		var commandRegex = /^[!/](\w+)(?:\s+([ -~]+)?)?$/,
			user = bot.users[userID],
			userIdent = user.username+'#'+user.discriminator,
			isPM = typeof bot.channels[channelID] === 'undefined';
		console.log(userIdent+' ran '+message+' from '+(isPM?'a PM':chalk.blue('#'+bot.channels[channelID].name)));
		if (!commandRegex.test(message))
			bot.sendMessage({
				to: channelID,
				message: replyTo(userID, 'Invalid command: '+(message.replace(/^([!/]\S+).*/,''))),
			});
		var commandMatch = message.match(commandRegex),
			command = commandMatch[1],
			argStr = commandMatch[2] ? commandMatch[2].trim() : '',
			args = argStr ? argStr.split(/\s+/) : [];

		CallCommand(userID, channelID, message, event, userIdent, command, argStr, args);
	}

	function ProfanityFilter(userID, channelID, message, event){
		if (userID === bot.id || isStaff(userID) || isMember(userID))
			return;

		var matching = /\b(f+[u4a]+[Ссc]+k+(?:tard|[1i]ng)?|[Ссc]un[7t]|a[5$s]{2,}(?:h[0o]+l[3e]+)|(?:d[1i]+|[Ссc][0o])[Ссc]k(?:h[3e][4a]*d)?|b[1ie3a4]+t[Ссc]h)\b/ig,
			user = bot.users[userID],
			ident = user.username+'#'+user.discriminator;

		if (!matching.test(message))
			return false;

		console.log(ident+' triggered profanity filter in channel '+chalk.blue('#'+bot.channels[channelID].name)+' with message: '+(message.replace(matching,function(str){
			return chalk.red(str);
		})));

		if (channelID === OurChannelIDs.nsfw){
			console.log(ident+' wasn\'t warned because they cursed in the NSFW channel');
			return false;
		}

		wipeMessage(channelID, event.d.id, function(msg){
			msg = 'Please avoid using swear words.\nYour message (shown below) in <#'+channelID+'> contained inapproperiate language and it was promptly removed.'+msg+'\n\n**Original message:**\n'+(message.replace(matching,'__*$1*__'));
			respond(userID, msg);
		});
		return true;
	}

	function onMessage(_, userID, channelID, message, event) {
		var args = [].slice.call(arguments,1),
			callHandler = function(isPM){
				if (/^[!/]/.test(message))
					return ProcessCommand.apply(this, args);

				if (isPM !== true)
					ProfanityFilter.apply(this, args);
			};

		if (typeof OurServer.channels[channelID] === 'undefined'){
			bot.createDMChannel(userID, function(err, resp){
				if (err)
					return;

				if (typeof OurServer.members[resp.recipient.id] === 'undefined')
					return;

				console.log('Received PM from @'+resp.recipient.username+'#'+resp.recipient.discriminator+', contents: '+message);

				args = [resp.recipient.id, resp.id, message, event];
				callHandler(true);
			});
		}
		else callHandler();
	}
	bot.on('message', onMessage);

	bot.on('messageUpdate', function(_, newMsg, event){
		if (typeof newMsg.author === 'undefined')
			return;
		onMessage(null, newMsg.author.id, newMsg.channel_id, newMsg.content, event);
	});

	if (hasOwner && !config.LOCAL)
		getVersion(config.OWNER_ID,config.OWNER_ID,function(ver){
			bot.setPresence({ game: { name: 'version '+ver } });
		});

	bot.on('disconnect', function(errMsg, code){
		console.log('[DISCONNECT:'+code+'] '+errMsg);
		setTimeout(function(){
			process.exit();
		}, 5000);
	});

	process.on('SIGINT', function(){
		idle();
		process.exit();
	});
	process.on('exit', idle);
	function idle(){
		bot.setPresence({ idle_since: Date.now() });
	}
}
