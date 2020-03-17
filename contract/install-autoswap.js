import harden from '@agoric/harden';

// This initInstance function is specific to autoswap.
//
// Notably, it takes the first two purses of the wallet and
// uses them to add liquidity.
export default harden(({ wallet, zoe, registrar }) => {
  return harden({
    async initInstance(contractName, { source, moduleFormat }, now = Date.now()) {
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
      ] = await Promise.all([
        zoe~.makeInstance(installationHandle, { issuers: [issuer0, issuer1] }),
        zoe~.getInviteIssuer(),
      ])
    
      // =====================
      // === AWAITING TURN ===
      // =====================
    
      // 3. Get the instanceHandle
    
      const {
        extent: [{ instanceHandle }],
      } = await inviteIssuer~.getAmountOf(invite);
      const instanceId = await registrar~.register(contractName, instanceHandle);
    
      const extent0 = 900;
      const extent1 = 500;
    
      const offerDesc = {
        id: now,
    
        // Contract-specific metadata.
        instanceRegKey: instanceId,
        contractIssuerIndexToRole: ['TokenA', 'TokenB', 'Liquidity'],
    
        offerRulesTemplate: {
          offer: {
            TokenA: {
              pursePetname: pursePetname0,
              extent: extent0,
            },
            TokenB: {
              pursePetname: pursePetname1,
              extent: extent1,
            },
          },
          exit: { onDemand: {} },
        },
      };
    
      let resolve;
      let reject;
      const acceptedP = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
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
            return seat~.addLiquidity().catch(e => reject(`Cannot add liquidity: ${e}`));
          },
        },
      });

      // Use the wallet's offer system to finish the deployment.
      const requestContext = { origin: 'autoswap deploy', date: now };
      const id = await wallet~.addOffer(offerDesc, hooks, requestContext);
      wallet~.acceptOffer(id);

      return acceptedP;
    },
  });
});
