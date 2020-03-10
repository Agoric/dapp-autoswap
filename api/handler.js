import harden from '@agoric/harden';

function checkOrder(a0, a1, b0, b1) {
  if (a0 === b0 && a1 === b1) {
    return true;
  }

  if (a0 === b1 && a1 === b0) {
    return false;
  }

  throw new TypeError('Canot resolve asset ordering');
}

export default harden(({zoe, registrar, overrideInstanceId = undefined}, _inviteMaker) => {
  // If we have an overrideInstanceId, use it to assert the correct value in the RPC.
  function coerceInstanceId(instanceId = undefined) {
    if (instanceId === undefined) {
      return overrideInstanceId;
    }
    if (overrideInstanceId === undefined || instanceId === overrideInstanceId) {
      return instanceId;
    }
    throw TypeError(`instanceId ${JSON.stringify(instanceId)} must match ${JSON.stringify(overrideInstanceId)}`);
  }

  const registrarPCache = new Map();
  function getRegistrarP(id) {
    let regP = registrarPCache.get(id);
    if (!regP) {
      // Cache miss, so try the registrar.
      regP = E(registrar).get(id);
      registrarPCache.set(id, regP);
    }
    return regP;
  }

  const instancePCache = new Map();
  function getInstanceP(id) {
    let instanceP = instancePCache.get(id);
    if (!instanceP) {
      const instanceHandleP = getRegistrarP(id);
      instanceP = instanceHandleP.then(instanceHandle =>
        E(zoe).getInstance(instanceHandle));
      instancePCache.set(id, instanceP);
    }
    return instanceP;
  }

  const liquidityIdPCache = new Map();
  function getLiquidityId(instanceId) {
    let liquidityIdP = liquidityIdPCache.get(instanceId);
    if (!liquidityIdP) {
      liquidityIdP = getInstanceP(instanceId)
        .then(({ publicAPI }) => E(publicAPI).getLiquidityIssuer())
        .then(liquidityIssuer => E(registrar).register('autoswap-liquidity', liquidityIssuer));
      liquidityIdPCache.set(instanceId, liquidityIdP);
    }
    return liquidityIdP;
  }

  const amountMathPCache = new Map();
  function getAmountMathP(id) {
    let amountMathP = amountMathPCache.get(id);
    if (!amountMathP) {
      const regIssuerP = getRegistrarP(id);
      amountMathP = E(regIssuerP).getAmountMath();
      amountMathPCache.set(id, amountMathP);
    }
    return amountMathP;
  }

  function getPrice(instanceId, extent0, issuerId0, _issuerId1) {
    const instanceP = getInstanceP(instanceId);
    const amountMath0P = getAmountMathP(issuerId0);

    return Promise.all([instanceP, amountMath0P]).then(
      ([{ publicAPI }, amountMath0]) => {

        return E(amountMath0).make(extent0)
          .then(amount0 => E(publicAPI).getPrice(amount0))
          .then(amount1 => amount1.extent);
      });
  }

  function getOfferRules(instanceId, extent0, issuerId0, issuerId1) {
    const instanceP = getInstanceP(instanceId);
    const regIssuer0P = getRegistrarP(issuerId0);
    const regIssuer1P = getRegistrarP(issuerId1);
    const liquidityIdP = getLiquidityId(instanceId);

    return Promise.all([instanceP, regIssuer0P, regIssuer1P, liquidityIdP]).then(
      ([{ terms: {
        issuers: [contractIssuer0, contractIssuer1],
      }}, regIssuer0, regIssuer1, liquidityId]) => {
        // Check whether we sell on contract issuer 0 or 1.
        const normal = checkOrder(
          regIssuer0,
          regIssuer1,
          contractIssuer0,
          contractIssuer1,
        );

        // Construct the rules for serialization (no instance).
        // This rule is the payment
        const payinRule = {
          kind: 'offerAtMost',
          amount: { issuerId: issuerId0, extent: extent0 },
        };
        // This rule is the payout
        const payoutRule = {
          kind: 'wantAtLeast',
          amount: { issuerId: issuerId1 },
        };

        // Order the rules accordingly.
        const offerRules = harden({
          payoutRules: [
            normal ? payinRule : payoutRule,
            normal ? payoutRule : payinRule,
            {
              kind: 'wantAtLeast',
              amount: { issuerId: liquidityId },
            },
          ],
          exitRule: {
            kind: 'onDemand',
          },
        });

        return offerRules;
      },
    );
  }

  return harden({
    getCommandHandler() {
      return harden({
        async processInbound(obj, _home) {
          const { type, data } = obj;
          switch (type) {
            case 'autoswapGetPrice': {
              const { instanceId, extent0, issuerId0, issuerId1 } = data;
              const id = coerceInstanceId(instanceId);
              const extent = await getPrice(
                id,
                extent0,
                issuerId0,
                issuerId1,
              );
              return { type: 'autoswapPrice', data: extent };
            }
  
            case 'autoswapGetOfferRules': {
              const { instanceId, extent0, issuerId0, issuerId1 } = data;
              const id = coerceInstanceId(instanceId);
              const offerRules = await getOfferRules(
                id,
                extent0,
                issuerId0,
                issuerId1,
              );
              return { type: 'autoswapOfferRules', data: offerRules };
            }
            default: {
              return false;
            }
          }
        },
      });
    },
  });
});
