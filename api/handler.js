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
  function getPrice(instanceId, extent0, assayId0, _assayId1) {
    const instanceHandleP = E(registrar).get(instanceId);
    const regAssay0P = E(registrar).get(assayId0);
    const label0P = E(regAssay0P).getLabel();

    return Promise.all([instanceHandleP, label0P]).then(
      ([instanceHandle, label0]) =>
        E(zoe)
          .getInstance(instanceHandle)
          .then(({ publicAPI }) => {
            const unit0 = harden({ label: label0, extent: extent0 });

            return E(publicAPI)
              .getPrice(unit0)
              .then(unit1 => unit1.extent);
          }),
    );
  }

  function getOfferRules(instanceId, extent0, assayId0, assayId1) {
    const instanceHandleP = E(registrar).get(instanceId);
    const regAssay0P = E(registrar).get(assayId0);
    const regAssay1P = E(registrar).get(assayId1);

    return Promise.all([instanceHandleP, regAssay0P, regAssay1P]).then(
      ([instanceHandle, regAssay0, regAssay1]) =>
        E(zoe)
          .getInstance(instanceHandle)
          .then(
            ({
              terms: {
                assays: [contractAssay0, contractAssay1],
              },
            }) => {
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
                    units: {},
                  },
                ],
                exitRule: {
                  kind: 'onDemand',
                },
              });

              return offerRules;
            },
          ),
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
