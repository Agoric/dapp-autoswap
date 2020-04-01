import harden from '@agoric/harden';
import makePromise from '@agoric/make-promise';

// This javascript source file uses the "tildot" syntax (foo~.bar()) for
// eventual sends.
// https://agoric.com/documentation/ertp/guide/other-concepts.html
//  Tildot is standards track with TC39, the JavaScript standards committee.
// https://github.com/tc39/proposal-wavy-dot

// This initInstance function is specific to autoswap.
//
// Notably, it takes the first two purses of the wallet and
// uses them to add liquidity.
const CONTRACT_NAME = 'autoswap';
export default harden(({ wallet, zoe, registrar }) => {
  return harden({
    async initInstance({ source, moduleFormat }, now = Date.now()) {
      const installationHandle = await zoe~.install(source, moduleFormat);

      // =====================
      // === AWAITING TURN ===
      // =====================
    
      // 1. Issuers and purse petnames
      // Just take the first two purses.
      const [[pursePetname0], [pursePetname1]] = await wallet~.getPurses()

      // =====================
      // === AWAITING TURN ===
      // =====================
    
      const [issuer0, issuer1] = await Promise.all([
        wallet~.getPurseIssuer(pursePetname0),
        wallet~.getPurseIssuer(pursePetname1),
      ]);

      // =====================
      // === AWAITING TURN ===
      // =====================
    
      // 2. Contract instance.
      const [
        invite,
        inviteIssuer,
        brandRegKey0,
        brandRegKey1,
      ] = await Promise.all([
        zoe~.makeInstance(installationHandle, { TokenA: issuer0, TokenB: issuer1 }),
        zoe~.getInviteIssuer(),
        wallet~.getIssuerNames(issuer0)~.brandRegKey,
        wallet~.getIssuerNames(issuer1)~.brandRegKey,
      ])
    
      // =====================
      // === AWAITING TURN ===
      // =====================
    
      // 3. Get the instanceHandle
    
      const {
        extent: [{ instanceHandle }],
      } = await inviteIssuer~.getAmountOf(invite);
      const instanceId = await registrar~.register(CONTRACT_NAME, instanceHandle);
    
      const extent0 = 900;
      const extent1 = 500;
    
      const offerDesc = {
        id: now,
    
        // Contract-specific metadata.
        instanceRegKey: instanceId,
        contractIssuerIndexToRole: ['TokenA', 'TokenB', 'Liquidity'],
    
        proposalTemplate: {
          give: {
            TokenA: {
              pursePetname: pursePetname0,
              extent: extent0,
            },
            TokenB: {
              pursePetname: pursePetname1,
              extent: extent1,
            },
          },
          exit: { onDemand: null },
        },
      };
    
      const performed = makePromise();
      const hooks = harden({
        publicAPI: {
          getInvite(_publicAPI) {
            return invite;
          },
          deposited(_publicAPI) {
            resolve({ instanceId });
          },
        },
        seat: {
          performOffer(seat) {
            const p = seat~.addLiquidity();
            p.then(performed.res, performed.rej);
            return p;
          },
        },
      });

      // Use the wallet's offer system to finish the deployment.
      const requestContext = { origin: `${CONTRACT_NAME} deploy`, date: now };
      const id = await wallet~.addOffer(offerDesc, hooks, requestContext);
      wallet~.acceptOffer(id).catch(performed.rej);

      return {
        CONTRACT_NAME,
        instanceId,
        initP: performed.p,
        brandRegKeys: {
          TokenA: brandRegKey0,
          TokenB: brandRegKey1,
        }
      };
    },
  });
});
