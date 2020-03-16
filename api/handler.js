import harden from '@agoric/harden';

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

  function getPrice(instanceRegKey, extent0, brandRegKey0, _brandRegKey1) {
    const instanceP = getInstanceP(instanceRegKey);
    const brand0P = getRegistrarP(brandRegKey0);

    return Promise.all([instanceP, brand0P]).then(
      ([{ publicAPI }, brand0]) => {

        const amount0 = { brand: brand0, extent: extent0 };
        return E(publicAPI).getPrice(amount0)
          .then(amount1 => amount1.extent);
      });
  }

  return harden({
    getCommandHandler() {
      return harden({
        async processInbound(obj, _home) {
          const { type, data } = obj;
          switch (type) {
            case 'autoswapGetPrice': {
              const { instanceId, extent0, brandRegKey0, brandRegKey1 } = data;
              const id = coerceInstanceId(instanceId);
              const extent = await getPrice(
                id,
                extent0,
                brandRegKey0,
                brandRegKey1,
              );
              return { type: 'autoswapPrice', data: extent };
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
