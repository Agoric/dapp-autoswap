// Agoric Dapp contract deployment script for autoswap
import fs from 'fs';

import harden from '@agoric/harden';
import makeAmountMath from '@agoric/ertp/src/amountMath';

// This javascript source file uses the "tildot" syntax (foo~.bar()) for
// eventual sends. Tildot is standards track with TC39, the JavaScript standards
// committee.
// TODO: improve this comment. https://github.com/Agoric/agoric-sdk/issues/608

const DAPP_NAME = "dapp-autoswap";

export default async function deployContract(homeP, { bundleSource, pathResolve },
  CONTRACT_NAME = 'autoswap') {

  const wallet = homeP~.wallet;
  await wallet~.ping({ pong(data) { console.log('ponged', data) }}, 'hello123');
  process.exit(0);

  // Create a source bundle for the "myFirstDapp" smart contract.
  const { source, moduleFormat } = await bundleSource(pathResolve(`./${CONTRACT_NAME}.js`));

  // =====================
  // === AWAITING TURN ===
  // =====================

  const installationHandle = await homeP~.zoe~.install(source, moduleFormat);

  // =====================
  // === AWAITING TURN ===
  // =====================

  // 1. Issuers and payments
  // Just take the first two purses.
  const [[pursePetname0, purse0], [pursePetname1, purse1]] = await wallet~.getPurses()
  const issuer0P = wallet~.getPurseIssuer(pursePetname0);
  const issuer1P = wallet~.getPurseIssuer(pursePetname1);

  const getLocalAmountMath = issuer =>
    Promise.all([
      issuer~.getBrand(),
      issuer~.getMathHelpersName(),
  ]).then(([brand, mathHelpersName]) => makeAmountMath(brand, mathHelpersName));

  const amountMath0P = getLocalAmountMath(issuer0P);
  const amountMath1P = getLocalAmountMath(issuer1P);
  const withdrawAmount = (amountMath, purse, extent) =>
    amountMath.then(am => purse~.withdraw(am.make(extent)));

  const payment0P = withdrawAmount(amountMath0P, purse0, 900);
  const payment1P = withdrawAmount(amountMath1P, purse1, 900);

  const [
    issuer0,
    issuer1,
    amountMath0,
    amountMath1,
    payment0,
    payment1
  ] = await Promise.all([
    issuer0P,
    issuer1P,
    amountMath0P,
    amountMath1P,
    payment0P,
    payment1P
  ]);

  // =====================
  // === AWAITING TURN ===
  // =====================

  // 2. Contract instance.
  const [
    invite,
    inviteIssuer,
  ] = await Promise.all([
    homeP~.zoe~.makeInstance(installationHandle, { issuers: [issuer0, issuer1] }),
    homeP~.zoe~.getInviteIssuer(),
  ])

  // =====================
  // === AWAITING TURN ===
  // =====================

  // 3. Get the instanceHandle

  const {
    extent: [{ instanceHandle }],
  } = await inviteIssuer~.getAmountOf(invite);
  const instanceId = await homeP~.registrar~.register(CONTRACT_NAME, instanceHandle);

  let liquidityOkP;
  const hooks = harden({
    publicAPI: {
      getInvite(_publicAPI) { return invite; },
    },
    seat: {
      async performOffer(seat) { liquidityOkP = seat~.addLiquidity(); },
    },
  });

  const offerDesc = {
    id: Date.now(),

    // Contract-specific metadata.
    instanceRegKey: instanceId,
    contractIssuerIndexToRole: ['TokenA', 'TokenB', 'Liquidity'],

    offerRulesTemplate: {
      offer: {
        TokenA: {
          pursePetname: pursePetname0,
          extent: 800,
        },
        TokenB: {
          pursePetname: pursePetname1,
          extent: 900,
        },
      },
      exit: { onDemand: {} },
    },
  };

  const requestContext = { origin: 'autoswap deploy', date: Date.now() };
  await wallet~.addOffer(offerDesc, hooks, requestContext);
  await wallet~.acceptOffer(offerDesc.id);

  console.log('- instance made', CONTRACT_NAME, '=>', instanceId);

  // Save the instanceId somewhere where the UI can find it.
  if (await liquidityOkP) {
    const dappConstants = {
      BRIDGE_URL: 'agoric-lookup:https://local.agoric.com?append=/bridge',
      API_URL: '/',
      CONTRACT_ID: instanceId,
    };
    const dc = 'dappConstants.js';
    console.log('writing', 'dappConstants.js');
    await fs.promises.writeFile(dc, `globalThis.__DAPP_CONSTANTS__ = ${JSON.stringify(dappConstants, undefined, 2)}`);

    // Now add URLs so that development functions without internet access.
    dappConstants.BRIDGE_URL = "http://127.0.0.1:8000";
    dappConstants.API_URL = "http://127.0.0.1:8000";
    const envFile = pathResolve(`../ui/.env.local`);
    console.log('writing', envFile);
    const envContents = `\
  REACT_APP_DAPP_CONSTANTS_JSON='${JSON.stringify(dappConstants)}'
`;
    await fs.promises.writeFile(envFile, envContents);
  }
}
