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

export default harden(({zoe, registrar}, _inviteMaker) => {
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
        .then(({ publicAPI }) => E(publicAPI).getLiquidityAssay())
        .then(liquidityAssay => E(registrar).register('autoswap-liquidity', liquidityAssay));
      liquidityIdPCache.set(instanceId, liquidityIdP);
    }
    return liquidityIdP;
  }

  const labelPCache = new Map();
  function getLabelP(id) {
    let labelP = labelPCache.get(id);
    if (!labelP) {
      const regAssayP = getRegistrarP(id);
      labelP = E(regAssayP).getLabel();
      labelPCache.set(id, labelP);
    }
    return labelP;
  }

  function getPrice(instanceId, extent0, assayId0, _assayId1) {
    const instanceP = getInstanceP(instanceId);
    const label0P = getLabelP(assayId0);

    return Promise.all([instanceP, label0P]).then(
      ([{ publicAPI }, label0]) => {
        const unit0 = harden({ label: label0, extent: extent0 });

        return E(publicAPI)
          .getPrice(unit0)
          .then(unit1 => unit1.extent);
      });
  }

  function getOfferRules(instanceId, extent0, assayId0, assayId1) {
    const instanceP = getInstanceP(instanceId);
    const regAssay0P = getRegistrarP(assayId0);
    const regAssay1P = getRegistrarP(assayId1);
    const liquidityIdP = getLiquidityId(instanceId);

    return Promise.all([instanceP, regAssay0P, regAssay1P, liquidityIdP]).then(
      ([{ terms: {
        assays: [contractAssay0, contractAssay1],
      }}, regAssay0, regAssay1, liquidityId]) => {
        // Check whether we sell on contract assay 0 or 1.
        const normal = checkOrder(
          regAssay0,
          regAssay1,
          contractAssay0,
          contractAssay1,
        );

        // Construct the rules for serialization (no instance).
        // This rule is the payment
        const payinRule = {
          kind: 'offerAtMost',
          units: { assayId: assayId0, extent: extent0 },
        };
        // This rule is the payout
        const payoutRule = {
          kind: 'wantAtLeast',
          units: { assayId: assayId1 },
        };

        // Order the rules accordingly.
        const offerRules = harden({
          payoutRules: [
            normal ? payinRule : payoutRule,
            normal ? payoutRule : payinRule,
            {
              kind: 'wantAtLeast',
              units: { assayId: liquidityId },
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
              const { instanceId, extent0, assayId0, assayId1 } = data;
              const extent = await getPrice(
                instanceId,
                extent0,
                assayId0,
                assayId1,
              );
              return { type: 'autoswapPrice', data: extent };
            }
  
            case 'autoswapGetOfferRules': {
              const { instanceId, extent0, assayId0, assayId1 } = data;
              const offerRules = await getOfferRules(
                instanceId,
                extent0,
                assayId0,
                assayId1,
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
