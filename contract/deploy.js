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
  const purse0P = homeP~.wallet~.getPurse('moola purse');
  const purse1P = homeP~.wallet~.getPurse('simolean purse');
  const issuer0P = homeP~.wallet~.getPurseIssuer('moola purse');
  const issuer1P = homeP~.wallet~.getPurseIssuer('simolean purse');

  const getLocalAmountMath = issuer =>
    Promise.all([
      issuer~.getBrand(),
      issuer~.getMathHelpersName(),
  ]).then(([brand, mathHelpersName]) => makeAmountMath(brand, mathHelpersName));

  const amountMath0P = getLocalAmountMath(issuer0P);
  const amountMath1P = getLocalAmountMath(issuer1P);
  const withdrawAmount = (amountMath, purse, extent) =>
    amountMath.then(am => purse~.withdraw(am.make(extent)));

  const payment0P = withdrawAmount(amountMath0P, purse0P, 900);
  const payment1P = withdrawAmount(amountMath1P, purse1P, 900);

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

  // =====================
  // === AWAITING TURN ===
  // =====================

  // 4. Get the contract terms and issuers

  const { terms: { issuers }} = await homeP~.zoe~.getInstance(instanceHandle);


  // =====================
  // === AWAITING TURN ===
  // =====================

  // 5. Offer rules
  const amountMath2 = await getLocalAmountMath(issuers[2])

  // =====================
  // === AWAITING TURN ===
  // =====================

  const offerRules = harden({
    payoutRules: [
      {
        kind: 'offerAtMost',
        amount: amountMath0.make(900),
      },
      {
        kind: 'offerAtMost',
        amount: amountMath1.make(900),
      },
      {
        kind: 'wantAtLeast',
        amount: amountMath2.getEmpty(),
      },
    ],
    exitRule: {
      kind: 'onDemand',
    },
  });

  // 6. Liquidities.

  const payments = [payment0, payment1];

  const { seat, payout } = await homeP~.zoe~.redeem(invite, offerRules, payments);

  // =====================
  // === AWAITING TURN ===
  // =====================

  const [liquidityOk, contractId, instanceId] = await Promise.all([
    seat~.addLiquidity(),
    homeP~.registrar~.register(DAPP_NAME, installationHandle),
    homeP~.registrar~.register(CONTRACT_NAME, instanceHandle),
  ]);

  // =====================
  // === AWAITING TURN ===
  // =====================

  console.log('- installation made', CONTRACT_NAME, '=>',  installationHandle);
  console.log('- instance made', CONTRACT_NAME, '=>', instanceId);
  console.log(liquidityOk);

  // Save the instanceId somewhere where the UI can find it.
  if (liquidityOk) {
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
