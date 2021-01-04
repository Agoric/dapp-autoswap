// @ts-check
// Agoric Dapp api deployment script

import fs from 'fs';
import dappConstants from '../ui/src/utils/constants';
import { E } from '@agoric/eventual-send';
import { makeLocalAmountMath } from '@agoric/ertp';

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
  // grab the installation that our contract deploy script put
  // in the public board.
  const { 
    INSTALLATION_BOARD_ID,
  } = dappConstants;
  const autoswapInstallation = await E(board).getValue(INSTALLATION_BOARD_ID);
  
  // Second, we can use the installation to create a new
  // instance of our contract code on Zoe. A contract instance is a running
  // program that can take offers through Zoe. Creating a contract
  // instance gives you an invitation to the contract. In this case, it is
  // an invitation to add liquidity to the liquidity pool.

  // At the time that we make the contract instance, we need to tell
  // Zoe what kind of token to accept as the two liquidity tokens. In
  // this instance, we will only accept moola and simoleans. (If we
  // wanted to accept other kinds of tokens, we could create other
  // instances.) We need to put this information in the form of a
  // keyword (a string that the contract determines, in this case,
  // 'Central' and 'Secondary') plus the issuers for the token kinds, the
  // moolaIssuer and simoleanIssuer.

  // In our example, moola and simoleans are widely used tokens.

  // getIssuers returns an array, because we currently cannot
  // serialize maps. We can immediately create a map using the array,
  // though. https://github.com/Agoric/agoric-sdk/issues/838
  const issuersArray = await E(wallet).getIssuers();
  const issuers = new Map(issuersArray);
  const moolaIssuer = issuers.get('moola');
  const simoleanIssuer = issuers.get('simolean');
    
  const moolaAmountMath = await makeLocalAmountMath(moolaIssuer);
  const simoleanAmountMath = await makeLocalAmountMath(simoleanIssuer);

  const issuerKeywordRecord = { Central: moolaIssuer, Secondary: simoleanIssuer };
  const { publicFacet, instance } = await E(zoe).startInstance(autoswapInstallation, issuerKeywordRecord);
  console.log('- SUCCESS! contract instance is running on Zoe');

  const liquidityIssuer = await E(publicFacet).getLiquidityIssuer();
  const liquidityAmountMath = await makeLocalAmountMath(liquidityIssuer);
  const addLiquidityInvitation = await E(publicFacet).makeAddLiquidityInvitation();

  // Let's add liquidity using our wallet and the addLiquidityInvitation
  // we have.
  const proposal = {
    give: {
      Central: moolaAmountMath.make(900),
      Secondary: simoleanAmountMath.make(500),
    },
    want: {
      Liquidity: liquidityAmountMath.getEmpty(),
    }
  };

  const pursesArray = await E(wallet).getPurses();
  const purses = new Map(pursesArray);

  const moolaPurse = purses.get('Fun budget');
  const simoleanPurse = purses.get('Nest egg');

  const moolaPayment = await E(moolaPurse).withdraw(proposal.give.Central);
  const simoleanPayment = await E(simoleanPurse).withdraw(proposal.give.Secondary);
  
  const payments = {
    Central: moolaPayment,
    Secondary: simoleanPayment,
  };
  const seat = await E(zoe).offer(addLiquidityInvitation, proposal, payments);
  console.log(await E(seat).getOfferResult());

  // Now that we've done all the admin work, let's share this
  // instance by adding it to the board.
  const INSTANCE_BOARD_ID = await E(board).getId(instance);

  console.log(`-- Contract Name: ${dappConstants.CONTRACT_NAME}`);
  console.log(`-- Instance Board Id: ${INSTANCE_BOARD_ID}`);

  const bundle = await bundleSource(pathResolve('./src/handler.js'));
  const handlerInstall = E(spawner).install(bundle);

  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const invitationBrand = await E(invitationIssuer).getBrand();
  const INVITATION_BRAND_BOARD_ID = await E(board).getId(invitationBrand);

  const handler = E(handlerInstall).spawn({ board, http, publicFacet, invitationIssuer });

  await E(http).registerAPIHandler(handler);

  // Re-save the constants somewhere where the UI and api can find it.
  const newDappConstants = {
    INSTANCE_BOARD_ID,
    INVITATION_BRAND_BOARD_ID,
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
