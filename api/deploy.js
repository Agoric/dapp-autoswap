// @ts-check
// Agoric Dapp api deployment script

import fs from 'fs';
import dappConstants from '../ui/src/utils/constants';
import { E } from '@agoric/eventual-send';
import makeAmountMath from '@agoric/ertp/src/amountMath';

// deploy.js runs in an ephemeral Node.js outside of swingset. The
// spawner runs within ag-solo, so is persistent.  Once the deploy.js
// script ends, connections to any of its objects are severed.

/**
 * @typedef {Object} DeployPowers The special powers that `agoric deploy` gives us
 * @property {(path: string) => { moduleFormat: string, source: string }} bundleSource
 * @property {(path: string) => string} pathResolve
 */

/**
 * @param {any} referencesPromise A promise for the references
 * available from REPL home
 * @param {DeployPowers} powers
 */
export default async function deployApi(referencesPromise, { bundleSource, pathResolve }) {
  
  // Let's wait for the promise to resolve.
  const references = await referencesPromise;

  // Unpack the references.
  const { 

    // *** LOCAL REFERENCES ***

    // This wallet only exists on this machine, and only you have
    // access to it. The wallet stores purses and handles transactions.
    wallet, 

    // Scratch is a map only on this machine, and can be used for
    // communication in objects between processes/scripts on this
    // machine.
    uploads: scratch,  

    // The spawner persistently runs scripts within ag-solo, off-chain.
    spawner,

    // *** ON-CHAIN REFERENCES ***

    // Zoe lives on-chain and is shared by everyone who has access to
    // the chain. In this demo, that's just you, but on our testnet,
    // everyone has access to the same Zoe.
    zoe, 

    // The board is an on-chain object that is used to make private
    // on-chain objects public to everyone else on-chain. These
    // objects get assigned a unique string id. Given the id, other
    // people can access the object through the board. Ids and values
    // have a one-to-one bidirectional mapping. If a value is added a
    // second time, the original id is just returned.
    board,


    // The http request handler.
    // TODO: add more explanation
    http,


  }  = references;


  // To get the backend of our dapp up and running, first we need to
  // grab the installationHandle that our contract deploy script put
  // in the public board.
  const { 
    INSTALLATION_HANDLE_BOARD_ID,
  } = dappConstants;
  const autoswapContractInstallationHandle = await E(board).getValue(INSTALLATION_HANDLE_BOARD_ID);
  
  // Second, we can use the installationHandle to create a new
  // instance of our contract code on Zoe. A contract instance is a running
  // program that can take offers through Zoe. Creating a contract
  // instance gives you an invite to the contract. In this case, it is
  // an invite to add liquidity to the liquidity pool.

  // At the time that we make the contract instance, we need to tell
  // Zoe what kind of token to accept as the two liquidity tokens. In
  // this instance, we will only accept moola and simoleans. (If we
  // wanted to accept other kinds of tokens, we could create other
  // instances.) We need to put this information in the form of a
  // keyword (a string that the contract determines, in this case,
  // 'TokenA' and 'TokenB') plus the issuers for the token kinds, the
  // moolaIssuer and simoleanIssuer.

  // In our example, moola and simoleans are widely used tokens.

  // getIssuers returns an array, because we currently cannot
  // serialize maps. We can immediately create a map using the array,
  // though. https://github.com/Agoric/agoric-sdk/issues/838
  const issuersArray = await E(wallet).getIssuers();
  const issuers = new Map(issuersArray);
  const moolaIssuer = issuers.get('moola');
  const simoleanIssuer = issuers.get('simolean');

  const getLocalAmountMath = issuer =>
    Promise.all([
      E(issuer).getBrand(),
      E(issuer).getMathHelpersName(),
    ]).then(([brand, mathHelpersName]) => makeAmountMath(brand, mathHelpersName));
    
  const moolaAmountMath = await getLocalAmountMath(moolaIssuer);
  const simoleanAmountMath = await getLocalAmountMath(simoleanIssuer);

  const issuerKeywordRecord = { TokenA: moolaIssuer, TokenB: simoleanIssuer };
  const { invite: addLiquidityInvite, instanceRecord: { publicAPI, handle: instanceHandle } } = await E(zoe).makeInstance(autoswapContractInstallationHandle, issuerKeywordRecord);
  console.log('- SUCCESS! contract instance is running on Zoe');

  const liquidityIssuer = await E(publicAPI).getLiquidityIssuer();
  const liquidityAmountMath = await getLocalAmountMath(liquidityIssuer);

  // Let's add liquidity using our wallet and the addLiquidityInvite
  // we have.
  const proposal = {
    give: {
      TokenA: moolaAmountMath.make(900),
      TokenB: simoleanAmountMath.make(500),
    },
    want: {
      Liquidity: liquidityAmountMath.getEmpty(),
    }
  };

  const pursesArray = await E(wallet).getPurses();
  const purses = new Map(pursesArray);

  const moolaPurse = purses.get('Fun budget');
  const simoleanPurse = purses.get('Nest egg');

  const moolaPayment = await E(moolaPurse).withdraw(proposal.give.TokenA);
  const simoleanPayment = await E(simoleanPurse).withdraw(proposal.give.TokenB);
  
  const payments = {
    TokenA: moolaPayment,
    TokenB: simoleanPayment,
  };
  const { outcome, payout } = await E(zoe).offer(addLiquidityInvite, proposal, payments);
  console.log(await outcome);

  // Now that we've done all the admin work, let's share this
  // instanceHandle by adding it to the board.
  const INSTANCE_HANDLE_BOARD_ID = await E(board).getId(instanceHandle);

  console.log(`-- Contract Name: ${dappConstants.CONTRACT_NAME}`);
  console.log(`-- InstanceHandle Board Id: ${INSTANCE_HANDLE_BOARD_ID}`);

  const bundle = await bundleSource(pathResolve('./src/handler.js'));
  const handlerInstall = E(spawner).install(bundle);

  const inviteIssuer = await E(zoe).getInviteIssuer();
  const inviteBrand = await E(inviteIssuer).getBrand();
  const INVITE_BRAND_BOARD_ID = await E(board).getId(inviteBrand);

  const handler = E(handlerInstall).spawn({ board, publicAPI, inviteIssuer });

  await E(http).registerAPIHandler(handler);

  // Re-save the constants somewhere where the UI and api can find it.
  const newDappConstants = {
    INSTANCE_HANDLE_BOARD_ID,
    INVITE_BRAND_BOARD_ID,
    ...dappConstants,
  };
  const defaultsFile = pathResolve(`../ui/src/utils/defaults.js`);
  console.log('writing', defaultsFile);
  const defaultsContents = `\
  // GENERATED FROM ${pathResolve('./deploy.js')}
  export default ${JSON.stringify(newDappConstants, undefined, 2)};
  `;
  await fs.promises.writeFile(defaultsFile, defaultsContents);
}
