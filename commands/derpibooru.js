const
  unirest = require('unirest'),
  chalk = require('chalk'),
  Command = require('../classes/Command'),
  util = require('../shared-utils'),
  Server = require('../classes/Server'),
  channelNames = require('../channel-names');

const
  ordering = 'o:(desc|asc)',
  sorting = 'by:(score|relevance|width|height|comments|random|wilson)',
  linking = 'as:link',
  briefing = 'e:brief';

module.exports = new Command({
  name: 'derpibooru',
  help: () =>
    'This command can be used to return the first result of a Derpibooru search.\n' +
    `**Note:** When called outside the NSFW channel or a PM this command will only show results accessible by the site's default filter.\n\n` +
    '__**Bot-secific search keywords:**__\n\n' +
    ` ● \`${ordering}\` - Order of the results (default: \`desc\`)\n` +
    ` ● \`${sorting}\` - Same as "Sort by" on the actual site.\n` +
    ` ● \`${linking}\` - When specified only returns the link to the search page with the specified parameters instead of displaying the image as an embed` +
    ` ● \`${briefing}\` - When specified details like the description, uploader and counters will not be shown in the embed`,
  usage: ['safe,o:asc', 'safe,rd o:asc', 'ts by:random', 'meme e:brief'],
  perm: 'everyone',
  allowPM: true,
  action: args => {
    if (!args.argArr.length)
      return Server.reply(args.message, util.reqparams(args.command));

    let query = args.argStr,
      extra = '',
      inNSFW = args.channel.name === channelNames.NSFW,
      orderTest = new RegExp(`(^|\\s)${ordering}(\\s|$)`, 'i'),
      sortbyTest = new RegExp(`(^|\\s)${sorting}(\\s|$)`, 'i'),
      asLinkTest = new RegExp(`(^|\\s)${linking}(\\s|$)`, 'ig'),
      briefTest = new RegExp(`(^|\\s)${briefing}(\\s|$)`, 'ig'),
      returnAsLink = false,
      briefEmbed = false;
    if (inNSFW)
      extra += '&filter_id=56027';
    if (asLinkTest.test(query)) {
      returnAsLink = true;
      query = query.replace(asLinkTest, '').trim();
    }
    if (briefTest.test(query)) {
      briefEmbed = true;
      query = query.replace(briefTest, '').trim();
    }
    if (orderTest.test(query)) {
      let order = query.match(orderTest);
      query = query.replace(orderTest, '').trim();
      extra += '&sd=' + order[1];
    }
    if (sortbyTest.test(query)) {
      let sortby = query.match(sortbyTest);
      query = query.replace(sortbyTest, '').trim();
      extra += '&sf=' + sortby[1];
    }

    query = query.replace(/,{2,}/g, ',').trim().replace(/(^,|,$)/, '');
    let url = 'https://derpibooru.org/api/v1/json/search/images?q=' + encodeURIComponent(query) + extra;
    if (returnAsLink)
      return Server.reply(args.message, url.replace('/search.json', '/search'));
    console.info('Derpi search for ' + chalk.blue(url));
    unirest.get(url)
      .header("Accept", "application/json")
      .header("User-Agent", process.env.UA_STRING)
      .end(function (result) {
        if (result.error || typeof result.body !== 'object') {
          console.error(result.error, result.body);
          return Server.reply(args.message, `Derpibooru search failed (HTTP ${result.status}). ${Server.mentionOwner(args.authorID)} should see what caused the issue in the logs.`);
        }

        let data = result.body;
        if (typeof data.images === 'undefined' || typeof data.images[0] === 'undefined')
          return Server.reply(args.message, 'Derpibooru search returned no results.' +
            (
              /(questionable|explicit|grimdark|grotesque)/.test(query) && !inNSFW ?
                ` Searching for system tags other than \`safe\` and \`suggestive\` is unlikely to produce any results outside the NSFW channel.` : ''
            ) + ' Don\'t forget that artist and OC tags need to be prefixed with `artist:` and `oc:` respectively.'
          );

        Server.respondWithDerpibooruImage(args, data.images[0], briefEmbed);
      });
  },
});
